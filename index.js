"use strict";

const url = require("url");
const axios = require("axios");

// From Heatzy API : https://drive.google.com/drive/folders/0B9nVzuTl4YMOaXAzRnRhdXVma1k
// https://heatzy.com/blog/tout-sur-heatzy
const heatzyUrl = "https://euapi.gizwits.com/app/";
const loginUrl = url.parse(heatzyUrl + "login");
const heatzy_Application_Id = "c70a66ff039d41b4a220e198b0fcc8b3";

let Service, Characteristic;

module.exports = (homebridge) => {
  /* this is the starting point for the plugin where we register the accessory */
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory(
    "homebridge-heatzy-as-switch",
    "HeatzyPilote",
    SwitchAccessory
  );
};

function SwitchAccessory(log, config) {
  this.log = log;
  this.config = config;

  // Config
  this.getUrl = url.parse(heatzyUrl + "devdata/" + config["did"] + "/latest");
  this.postUrl = url.parse(heatzyUrl + "control/" + config["did"]);
  this.name = config["name"];
  this.username = config["username"];
  this.password = config["password"];
  this.interval = config["interval"] || 60;
  this.trace = config["trace"] || false;

  // Heatzy token
  this.heatzyToken = "";
  this.heatzyTokenExpire_at = Date.now() - 10000; // Initial value is 10s in the past, to force login and refresh of token

  this.state = null;

  this.informationService = new Service.AccessoryInformation()
    .setCharacteristic(Characteristic.Manufacturer, "Heatzy")
    .setCharacteristic(Characteristic.Model, "Heatzy Pilote V2")
    .setCharacteristic(Characteristic.SerialNumber, " unknown");
  this.service = new Service.Switch(this.config.name);
  this.service
    .getCharacteristic(Characteristic.On)
    .on("get", this.getOnCharacteristicHandler.bind(this))
    .on("set", this.setOnCharacteristicHandler.bind(this));

  this.updateState(); // Get the current state of the device, and update HomeKit
  setInterval(this.updateState.bind(this), this.interval * 1000); // The state of the device will be checked every this.interval seconds
  this.log("starting HeatzyPilote...");
}

async function updateToken(device) {
  try {
    const response = await axios({
      method: "post",
      url: loginUrl,
      headers: {
        "X-Gizwits-Application-Id": heatzy_Application_Id,
      },
      data: {
        username: device.username,
        password: device.password,
        lang: "en",
      },
    });
    if (response.status == 200) {
      device.heatzyToken = response.data.token;
      device.heatzyTokenExpire_at = response.data.expire_at * 1000;
    } else {
      device.log(
        `${response.status} ${response.statusText} ${response.data.error_message}`
      );
    }
  } catch (error) {
    device.log(
      "Error : " + error.response.status + " " + error.response.statusText
    );
    device.log(
      "Error - Plugin unable to login to Heatzy server, and will not work"
    );
  }
}

async function getState(device) {
  let state = false;
  try {
    const response = await axios.get(device.getUrl, {
      headers: { "X-Gizwits-Application-Id": heatzy_Application_Id },
    });
    if (response.status == 200 && response.data.attr.mode == "cft") {
      state = true;
    } else {
      device.log(
        `${response.status} ${response.statusText} ${response.data.error_message}`
      );
      state = null;
    }
  } catch (error) {
    device.log(
      "Error : " + error.response.status + " " + error.response.statusText
    );
    state = null;
  } finally {
    return state;
  }
}

async function setState(device, state) {
  if (device.heatzyTokenExpire_at < Date.now()) {
    await updateToken(device);
  }
  let mode = "off";
  if (state) {
    mode = "cft";
  }
  try {
    const response = await axios({
      method: "post",
      url: device.postUrl,
      headers: {
        "X-Gizwits-Application-Id": heatzy_Application_Id,
        "X-Gizwits-User-token": device.heatzyToken,
      },
      data: {
        attrs: {
          mode: mode,
        },
      },
    });
    //	device.log(response);
    if (response.status == 200) {
    } else {
      // Useless ? all status != 2xx will be errors
      device.log(
        "Error - returned code not 200: " +
          response.status +
          " " +
          response.statusText +
          " " +
          response.data.error_message
      );
      state = null;
    }
  } catch (error) {
    device.log(
      "Error : " + error.response.status + " " + error.response.statusText
    );
    state = null;
  } finally {
    return state;
  }
}

SwitchAccessory.prototype.updateState = async function () {
  const state = await getState(this);
  if (state !== null) {
    if (this.state === null) {
      this.state = state;
    } 
    if (state !== this.state) {
      if (this.trace) {
        this.log("State has changed from: " + this.state + " to " + state);
      }
      this.state = state;
      this.service.updateCharacteristic(Characteristic.On, state);
    }
  }
};

SwitchAccessory.prototype.getOnCharacteristicHandler = async function (
  callback
) {
  const state = await getState(this);
  if (this.trace) {
    this.log("HomeKit asked for state (true for cft, false for off): " + state);
  }
  if (state != null) {
    callback(null, state);
  } else {
    this.log("Error : Unavailable state");
    callback(true);
  }
};

SwitchAccessory.prototype.setOnCharacteristicHandler = async function (
  value,
  callback
) {
  const state = await setState(this, value);
  if (this.trace) {
    this.log(
      "HomeKit changed state to (true for cft, false for off): " + state
    );
  }
  if (state != null) {
    callback(null, state);
  } else {
    this.log("Error - Cannot change state");
    callback(true);
  }
};

SwitchAccessory.prototype.getServices = function () {
  this.log("Init Services...");
  return [this.service, this.informationService];
};

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
    "homebridge-heatzy-as-Thermostat",
    "HeatzyPilote",
    ThermostatAccessory
  );
};

function ThermostatAccessory(log, config) {
  this.log = log;
  this.config = config;

  // Config
  this.getUrl = url.parse(heatzyUrl + "devdata/" + config["did"] + "/latest");
  this.postUrl = url.parse(heatzyUrl + "control/" + config["did"]);
  this.name = config["name"];
  this.username = config["username"];
  this.password = config["password"];
  this.interval = config["interval"] || 60;
  this.fake_temp = config["fake_temp"] >= 10 && config["fake_temp"] <= 38 ? config["fake_temp"] : 20;
  this.temp_unit = config["temp_unit"] === "F" ? 1 : 0;
  this.trace = config["trace"] || false;

  // Heatzy token
  this.heatzyToken = "";
  this.heatzyTokenExpire_at = Date.now() - 10000; // Initial value is 10s in the past, to force login and refresh of token

  this.current_state = null;
  this.target_state = null;

  this.informationService = new Service.AccessoryInformation()
    .setCharacteristic(Characteristic.Manufacturer, "Heatzy")
    .setCharacteristic(Characteristic.Model, "Heatzy Pilote V2")
    .setCharacteristic(Characteristic.SerialNumber, "unknown");
  this.service = new Service.Thermostat(this.config.name);

  this.service
    .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .on("get", this.handleCurrentHeatingCoolingStateGet.bind(this));

  this.service
    .getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .on("get", this.handleTargetHeatingCoolingStateGet.bind(this))
    .on("set", this.handleTargetHeatingCoolingStateSet.bind(this));

  this.service
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on("get", this.handleCurrentTemperatureGet.bind(this));

  this.service
    .getCharacteristic(Characteristic.TargetTemperature)
    .on("get", this.handleTargetTemperatureGet.bind(this))
    .on("set", this.handleTargetTemperatureSet.bind(this));

  this.service
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .on("get", this.handleTemperatureDisplayUnitsGet.bind(this))
    .on("set", this.handleTemperatureDisplayUnitsSet.bind(this));

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

async function getCurrentState(device) {
  let state = 0;
  try {
    const response = await axios.get(device.getUrl, {
      headers: { "X-Gizwits-Application-Id": heatzy_Application_Id },
    });
    if (response.status == 200) {
      switch (response.data.attr.mode) {
        case "cft":
          state = Characteristic.CurrentHeatingCoolingState.HEAT;
          break;
        case "eco":
          state = Characteristic.CurrentHeatingCoolingState.COOL;
          break;
        case "stop":
        case "fro":
        default:
          state = Characteristic.CurrentHeatingCoolingState.OFF;
          break;
      }
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

async function getTargetState(device) {
  let state = false;
  try {
    const response = await axios.get(device.getUrl, {
      headers: { "X-Gizwits-Application-Id": heatzy_Application_Id },
    });
    if (response.status == 200) {
      if (response.data.attr.timer_switch == 1) {
        state = Characteristic.TargetHeatingCoolingState.AUTO;
      }
      else {
        switch (response.data.attr.mode) {
          case "cft":
            state = Characteristic.TargetHeatingCoolingState.HEAT;
            break;
          case "eco":
            state = Characteristic.TargetHeatingCoolingState.COOL;
            break;
          case "stop":
          case "fro":
          default:
            state = Characteristic.TargetHeatingCoolingState.OFF;
            break;
        }
      }
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

async function setTargetState(device, state) {
  state = await setTargetProgState(device, state);
  if (state !== 3 && state !== null) {
    state = await setTargetMode(device, state);
  }
  return state;
}

async function setTargetMode(device, state) {
  if (device.heatzyTokenExpire_at < Date.now()) {
    await updateToken(device);
  }

  try {
    const request = {
      method: "post",
      url: device.postUrl,
      headers: {
        "X-Gizwits-Application-Id": heatzy_Application_Id,
        "X-Gizwits-User-token": device.heatzyToken,
      },
      data: {
        attrs: {
          mode: (state === 0) ? "stop" : (state === 1 ? "cft" : "eco"),
        },
      },
    }
    const response = await axios(request);
    if (response.status != 200) {
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

async function setTargetProgState(device, state) {
  if (device.heatzyTokenExpire_at < Date.now()) {
    await updateToken(device);
  }

  try {
    const request = {
      method: "post",
      url: device.postUrl,
      headers: {
        "X-Gizwits-Application-Id": heatzy_Application_Id,
        "X-Gizwits-User-token": device.heatzyToken,
      },
      data: {
        attrs: {
          timer_switch: state === 3 ? 1 : 0
        },
      },
    }
    const response = await axios(request);
    if (response.status != 200) {
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

ThermostatAccessory.prototype.updateState = async function () {
  const current_state = await getCurrentState(this);
  if (current_state !== null) {
    if (this.current_state === null) {
      this.current_state = current_state;
    } 
    if (current_state !== this.current_state) {
      if (this.current_state) {
        this.log("State has changed from: " + this.current_state + " to " + current_state);
      }
      this.current_state = current_state;
      this.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, current_state);

    }
  }
  
  const target_state = await getTargetState(this);
  if (target_state !== null) {
    if (this.target_state === null) {
      this.target_state = target_state;
    } 
    if (target_state !== this.target_state) {
      if (this.target_state) {
        this.log("State has changed from: " + this.target_state + " to " + target_state);
      }
      this.target_state = target_state;
      this.service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, target_state);
    }
  }
};

ThermostatAccessory.prototype.handleCurrentHeatingCoolingStateGet = async function (
  callback
) {
  const state = await getCurrentState(this);
  if (this.trace) {
    this.log("HomeKit asked for current state (0 for stop or fro, 1 for cft, 2 for eco): " + state);
  }
  if (state != null) {
    this.heatingCoolingState = state;
    callback(null, state);
  } else {
    this.log("Error : Unavailable state");
    callback(true);
  }
};

ThermostatAccessory.prototype.handleTargetHeatingCoolingStateGet = async function (
  callback
) {
  const state = await getTargetState(this);
  if (this.trace) {
    this.log("HomeKit asked for target state (0 for stop or fro, 1 for cft, 2 for eco, 3 for prog): " + state);
  }
  if (state != null) {
    callback(null, state);
  } else {
    this.log("Error : Unavailable state");
    callback(true);
  }
};

ThermostatAccessory.prototype.handleTargetHeatingCoolingStateSet = async function (
  value,
  callback
) {
  const state = await setTargetState(this, value);
  if (this.trace) {
    this.log("HomeKit changed target state to (0 for stop or fro, 1 for cft, 2 for eco, 3 for prog): " + state);
  }
  if (state != null) {
    callback(null, state);
  } else {
    this.log("Error - Cannot change state");
    callback(true);
  }
};

ThermostatAccessory.prototype.handleCurrentTemperatureGet = function (
  callback
) {
  if (this.trace) {
    this.log("Give fake current temp of " + this.fake_temp + "°");
  }
  callback(null, this.fake_temp);
};

ThermostatAccessory.prototype.handleTargetTemperatureGet = function (
  callback
) {
  if (this.trace) {
    this.log("Give fake target temp of " + this.fake_temp + "°");
  }
  callback(null, this.fake_temp);
};

ThermostatAccessory.prototype.handleTargetTemperatureSet = function (
  callback
) {
  if (this.trace) {
    this.log("Set fake temp of " + this.fake_temp + "°");
  }
  callback(null, this.fake_temp);
};

ThermostatAccessory.prototype.handleTemperatureDisplayUnitsGet = function (
  callback
) {
  if (this.trace) {
    this.log("Get fake temp unit (0 for °C, 1 for °F): " + this.temp_unit);
  }
  callback(null, this.temp_unit);
};

ThermostatAccessory.prototype.handleTemperatureDisplayUnitsSet = function (
  callback
) {
  if (this.trace) {
    this.log("Set fake temp unit (0 for °C, 1 for °F): " + this.temp_unit);
  }
  callback(null, this.temp_unit);
};

ThermostatAccessory.prototype.getServices = function () {
  this.log("Init Services...");
  return [this.service, this.informationService];
};

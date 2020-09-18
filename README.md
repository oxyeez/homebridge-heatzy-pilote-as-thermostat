# homebridge-heatzy-pilote

Homebridge plugin for Heatzy devices, considered as switches.
 
Heatzy uses the 'fil pilote' protocol to control an electric heater, with 4 states : 

* Confort  : temperature set on the heater
* Eco : temperature 3°C to 4°C below Confort
* Hors-gel : temperature set to ~7°C
* Off.

In this plugin, every Heatzy device is a switch, with these values : 

* `On` : Confort
* `Off` : Off

If you set the device from the Home app, `on` will set the heater to Confort, and `off` to off.
If you set it from the Heatzy app, or from the hardware button, Confort will be displayed in the Home app as `on`. Any other state (Eco, Hors-Gel or Off) will be displayed as `off`.


## Installation

Install or update this plugin using `npm i -g homebridge-heatzy-as-switch`.

Update the `config.json` file of your Homebridge setup, by modifying the sample configuration below.


## Configurations

The configuration parameters to enable your devices would need to be added to `accessories` section of the Homebridge configuration file. One block is necessary for each Heatzy device.

```json5
{
    ...
            "accessories": [
                {
                    "accessory": "HeatzyPilote",
                    "name": "Bedroom heater",
                    "username": "XXX",
                    "password": "XXX",
                    "did": "011233455677899abbcd",
                    "interval": 60,
                    "trace" : false
                }
            ]
    ...
}
```


#### Parameters

* `accessory ` is required, with `HeatzyPilote` value.  
* `name` (required) is anything you'd like to use to identify this device. You can always change the name from within the Home app.
* `username` and `password` (required) are the credentials you use in the Heatzy app.
* `did` (required) is the parameter for your device. See below how to get it.
* `interval` (optional) is how often (in seconds) the plugin will ask Heatzy servers the state of your device, which is necessary when you change the state from outside of Homekit. Default is 60s.
* `trace` (optional) displays the main events in homebridge log . Default is false.


## How to find the Device ID `did` of your devices

In your terminal, enter the two commands below.

For the first one, you will have to replace USERNAME and PASSWORD by your credentials used in the Heatzy app.
In return, you should get a `token` : you will use it in the second command, to replace YOURTOKEN.

The second command will return many datas. For each Heatzy device, you must find this piece of information : `"did": "011233455677899abbcd"`. To know wich `did` is for which device, you will find another piece of informatation close to it:` "dev_alias": "Name"`. The Name is the one used in the Heatzy app.
(You can choose a different name in homebridge configuration file, if you wish).


`curl -X POST --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'X-Gizwits-Application-Id: c70a66ff039d41b4a220e198b0fcc8b3' -d '{ "username": "USERNAME", "password": "PASSWORD", "lang": "en" }' 'https://euapi.gizwits.com/app/login'`

`curl -X GET --header 'Accept: application/json' --header 'X-Gizwits-User-token: YOURTOKEN' --header 'X-Gizwits-Application-Id: c70a66ff039d41b4a220e198b0fcc8b3' 'https://euapi.gizwits.com/app/bindings?limit=20&skip=0'`

const util=require('util');
const mqtt=require('mqtt');
const http = require('http');

const commandLineArgs = require('command-line-args')
const xml2js = require('xml2js');
var parser = new xml2js.Parser();
var valtree = {};

const optionDefinitions = [
	{ name: 'host', alias: 'h', type: String, defaultValue: "192.168.10.99" },
	{ name: 'id', alias: 'i', type: String, defaultValue: "eta" },
	{ name: 'wait', alias: 'w', type: Number, defaultValue: 1000 },
  	{ name: 'debug', alias: 'd', type: Boolean, defaultValue: false },
  	{ name: 'mqtthost', alias: 'm', type: String, defaultValue: "localhost"},
  ];

const options = commandLineArgs(optionDefinitions)

console.log("MQTT host     : " + options.mqtthost);
console.log("MQTT Client ID: " + options.id);

function sendMqtt(data) {
	MQTTclient.publish(options.id + "/" + options.host, JSON.stringify(data));
}
  
var MQTTclient = mqtt.connect("mqtt://"+options.mqtthost,{clientId: options.id});
	MQTTclient.on("connect",function(){
	console.log("MQTT connected");
})

MQTTclient.on("error",function(error){
		console.log("Can't connect" + error);
		process.exit(1)
	});

function getVariable(name, path) {
	const uri = "http://"+options.host+":8080/user/var"+path;
	if(options.debug) {
		console.log("name:" + name + " uri: " + uri);
	}
	http.get(uri, (resp) => {
	  let data = '';

	  resp.on('data', (chunk) => {
	    data += chunk;
	  });

	  resp.on('end', () => {
		parser.parseString(data.toString(), (err, result) => {
			if(err) {
				throw err;
			}
				if(options.debug) {
					console.log("NAME: " + name + " " + util.inspect(result, false, 10));
				}
			if(!result['eta']['error']) {
				const obj = result['eta']['value'][0];
				const val = parseInt(obj['_']);
				const decPlaces = parseInt(obj['$']['decPlaces']);
				const scaleFactor = parseInt(obj['$']['scaleFactor']);
				if(scaleFactor) {
					var num = (val/scaleFactor);
					if(options.debug) {
						console.log("name: " + name + "val: "+val+" decPlaces: "+decPlaces+" scaleFactor: "+scaleFactor + " = num: " + num);
					}
					var topic=path+"/"+name;
					topic = topic.replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ß/g, 'ss').replace(/ /g, '').replace(/\./g, '').replace(/-/g, '').replace(/:/g, '').replace(/°/g,'');
					valtree[topic] = num;
				}
			}
		});
	  });

	}).on("error", (err) => {
		console.log("Error: " + err.message);
	});
}

function recurseXMLTree(data) {
	data.forEach(element => {
		const name = element['$']['name'];
		const uri = element['$']['uri'];
		if(options.debug) {
			console.log(name + " : " + uri);
		}

		getVariable(name, uri);

		var tree=element['object'];
		if(tree && !name.includes('zeiten')) {
			recurseXMLTree(tree);
		}
	});
}

function getRoot(url) {

	http.get(url, (resp) => {
	  let data = '';

	  resp.on('data', (chunk) => {
	    data += chunk;
	  });

	  resp.on('end', () => {
		parser.parseString(data.toString(), (err, result) => {
			if(err) {
				throw err;
			}
			if(options.debug) {
				console.log(util.inspect(result, false, 10));
			}
			var tree1=result['eta']['menu'][0]['fub'];
			recurseXMLTree(tree1);
		});
	  });

	}).on("error", (err) => {
		console.log("Error: " + err.message);
	});
}

function timer(id) {
	getRoot("http://"+options.host+":8080/user/menu");
	setTimeout(timer, 10000, id);
	if(Object.keys(valtree).length) {
		if(options.debug) {
			console.log(util.inspect(valtree));
		}
		sendMqtt(valtree);
	}
}

timer(1);


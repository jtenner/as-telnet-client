import * as tc from "./index";
import { format } from "util";

import { Configuration, parse } from "configinator";
import { readFileSync } from "fs";
import path from "path";
import tls from "tls";
import { ASUtil, instantiateSync } from "@assemblyscript/loader";
import blessed from "blessed";


interface telnet_api extends Record<string, any> {
    allocate(size: number): number; 
    free(size: number): number;
    data(ptr: number): number;
}

export enum telnet_error_t {
	/** no error */ 
    TELNET_EOK = 0,   
	/** invalid parameter, or API misuse */ 
    TELNET_EBADVAL,   
	/** memory allocation failure */ 
    TELNET_ENOMEM,    
	/** data exceeds buffer size */ 
    TELNET_EOVERFLOW, 
	/** invalid sequence of special bytes */ 
    TELNET_EPROTOCOL, 
	/** error handling compressed streams */ 
    TELNET_ECOMPRESS  
};

const config: Configuration = {
    config: {
        name: "config",
        alias: "c",
        type: "R",
        defaultValue: "client.config.js"
    },
    properNouns: {
        name: "properNouns",
        type: "S",
        defaultValue: [],
        required: true,
    },
    ip: {
        type: "s",
        name: "ip",
        alias: "i",
        required: true,
        description: "The connection IP.",
    },
    port: {
        type: "n",
        name: "port",
        alias: "p",
        description: "The port number for the connection.",
    },
    tls: {
        name: "tls",
        type: "b",
        alias: "t"
    },
}

const argv = process.argv.slice(2);
const args = parse(argv, config, {
    cwd: process.cwd(),
    readFileSync(file, basename) {
        try {
            return readFileSync(path.join(basename, file), "utf-8");
        } catch (ex) {
            return null;
        }
    }
});

// check for diagnostics
if (args.diagnostics.length > 0) {
    for (const diag of args.diagnostics) {
        console.error(diag);
    }
    process.exit(1);
}

const screen = blessed.screen({
    smartCSR: true
});
const output = blessed.log({
    top: '0',
    left: '0',
    width: '100%',
    height: '90%',
    tags: true,
    style: {
      fg: 'white',
      bg: 'black',
      hover: {
        bg: 'green'
      }
    },
});
const input = blessed.box({
    top: '90%',
    left: '0',
    width: '100%',
    height: '10%',
    tags: true,
    border: {
        type: "line",
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: '#f0f0f0'
      },
      hover: {
        bg: 'green'
      }
    },
});

function getTelnet() {
    try {
        return instantiateSync<telnet_api>("./build/optimized.wasm", {
            telnet: {
                onData(ptr: number, len: number): number {
                    let data = Buffer.from(telnet.exports.memory!.buffer, ptr, len);
                    pushLine(data.toString("utf8"));
                    return data.length;
                },
                onError(ev: telnet_error_t, fatal: 1 | 0, desc: number): void {
                    let errorLine = `${fatal === 1 ? "FATAL " : ""}TELNET ERROR: ${telnet_error_t[ev]}: ${desc !== 0 ? telnet.exports.__getString(desc) : "No error description provided."}`;
                    pushLine(errorLine);
                },
                onSend(ptr: number, len: number): number {
                    let data = new Uint8Array(telnet.exports.memory!.buffer, ptr, len);
                    connection.write(data);
                    return data.length;
                },
            },
        });
    } catch (ex) {
        console.error(ex);
        // process.exit(1);
    }
}

let telnet = getTelnet()!;

const host = args.values.get(args.optionsByName.get("ip")!)!.value;
const port = args.values.get(args.optionsByName.get("port")!)!.value;

let connection = tls.connect({
    port,
    host,
    rejectUnauthorized: false,
}, () => {
    screen.title = `Connected: ${host}:${port}`;
    screen.render();
});

connection.on("data", (buff) => {
    let data = telnet.exports.allocate(buff.byteLength);
    let target = Buffer.from(telnet.exports.memory.buffer, data, buff.byteLength);
    buff.copy(target);
    telnet.exports.data(data);
    telnet.exports.free(data);
    // console.log(`Received data: ${buff.toString("utf8")}`)
    pushLine(`Received data: ${buff.toString("utf8")}`);
});

connection.on("error", (err) => {
   // console.log(err);
   pushLine(`CONNECTION ERROR: ${err.message}`);
});

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

screen.append(output);
screen.append(input);
screen.render();

function pushLine(input: string) {
    output.add(input);
    output.render();
}

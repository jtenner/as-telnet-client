import { telnet_error_t, telnet_event_data_t, telnet_t, TELNET_TELOPT_NAWS } from "as-telnet";

// @ts-ignore: Decorators
@external("telnet", "onData")
declare function onData(ptr: usize, len: usize): usize;

// @ts-ignore: Decorators
@external("telnet", "onSend")
declare function onSend(ptr: usize, len: usize): usize;

// @ts-ignore: Decorators
@external("telnet", "onError")
declare function onError(err: telnet_error_t, fatal: bool, desc: string): void;

export function allocate(size: usize): StaticArray<u8> {
    let buffer = new StaticArray<u8>(<i32>size);
    __pin(changetype<usize>(buffer));
    return buffer;
}

export function free(array: StaticArray<u8>): void {
    __unpin(changetype<usize>(array));
}

let compatibility = new StaticArray<u8>(255);
compatibility[TELNET_TELOPT_NAWS] = 0b10;

let telnet = new telnet_t<i32>(0, compatibility, 0);

telnet.onData = (t: telnet_t<i32>, ev: telnet_event_data_t): void => {
    let data = ev.data;
    let read = onData(changetype<usize>(data), <usize>data.length);
    assert(read == <usize>data.length);
};

telnet.onError = (t: telnet_t<i32>, ev: telnet_error_t, fatal: bool, desc: string): void => {
    onError(ev, fatal, desc);
};

telnet.onSend = (t: telnet_t<i32>, data: StaticArray<u8>): void => {
    let written = onSend(changetype<usize>(data), <usize>data.length);
    assert(written == <usize>data.length);
};

export function data(buffer: StaticArray<u8>): usize {
    telnet.recv(buffer);
    return <usize>buffer.length;
}

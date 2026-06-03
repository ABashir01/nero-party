import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

export function createPartySocket() {
  return io(API_BASE_URL, {
    autoConnect: false,
    transports: ["websocket"],
  });
}

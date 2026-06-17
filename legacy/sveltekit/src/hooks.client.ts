import { Buffer } from "buffer/";

globalThis.Buffer = globalThis.Buffer ?? Buffer;

window.addEventListener("error", (event) => {
  console.error("[task-web] window error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[task-web] unhandled rejection", event.reason);
});

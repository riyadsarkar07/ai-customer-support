type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function write(level: LogLevel, context: object | string, message?: string) {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const entry =
    typeof context === "string"
      ? { level, message: context }
      : { level, ...context, message: message ?? (context as { msg?: string }).msg };
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (ctx: object | string, msg?: string) => write("debug", ctx, msg),
  info: (ctx: object | string, msg?: string) => write("info", ctx, msg),
  warn: (ctx: object | string, msg?: string) => write("warn", ctx, msg),
  error: (ctx: object | string, msg?: string) => write("error", ctx, msg),
};

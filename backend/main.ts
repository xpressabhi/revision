export const api: Record<string, TinyApiHandler> = {
  ping: () => "pong",
};

export function init(app: TinyApp) {
  console.log("[backend] revision backend up");
  app.push("boot", { at: Date.now() });
}

// Members present in the tinyjs 0.42.3 runtime but missing from its shipped
// TypeScript definitions.

declare interface TinyApp {
  setHideOnClose(enabled: boolean): void;
}

declare interface TinyWindowHandle {
  setMinSize(width: number, height: number): void;
}

declare interface TinyTraySpec {
  primaryAction?: boolean;
}

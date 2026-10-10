// Lets `import text from "./file.html?raw"` pass the project's typecheck (Vite inlines the file as a string).
declare module "*?raw" {
  const content: string;
  export default content;
}

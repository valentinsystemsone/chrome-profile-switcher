// esbuild's text loader turns `import css from "./x.css"` into the file's contents.
declare module "*.css" {
  const css: string;
  export default css;
}

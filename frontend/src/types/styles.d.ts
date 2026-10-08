/** Declaraciones de tipos para módulos CSS. */
declare module '*.css';

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}
// Allow importing CSS modules in @explore-and-earn/ui components. Next processes
// these via transpilePackages; tsc needs the ambient declaration to resolve the
// import + give `styles` a typed shape.
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

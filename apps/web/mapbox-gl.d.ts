// Ambient declaration so the mapbox-gl stylesheet side-effect import
// (`import "mapbox-gl/dist/mapbox-gl.css"`) typechecks under `tsc --noEmit`.
// mapbox-gl ships no type declaration for its bundled stylesheet.
declare module "mapbox-gl/dist/mapbox-gl.css";

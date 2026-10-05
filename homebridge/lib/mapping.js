'use strict';

// HomeKit colour temperature is in mireds: 140 (cool white) .. 500 (warm).
// The hub's colour is 0 (warmest) .. 100 (whitest).
const MIRED_MIN = 140;
const MIRED_MAX = 500;

const colorToMired = (color) => Math.round(MIRED_MAX - (color / 100) * (MIRED_MAX - MIRED_MIN));
const miredToColor = (mired) =>
  Math.round(((MIRED_MAX - Math.min(MIRED_MAX, Math.max(MIRED_MIN, mired))) / (MIRED_MAX - MIRED_MIN)) * 100);

/**
 * HomeKit values for a light as reported by GET /api/lights. The hub reports
 * null while it doesn't know (e.g. nothing sent since it started); HomeKit needs
 * a number, so unknowns show as off / full brightness / neutral colour.
 */
function homekitValues(light) {
  return {
    on: light.on === true,
    brightness: light.brightness === null || light.brightness === undefined ? 100 : light.brightness,
    mired: colorToMired(light.color === null || light.color === undefined ? 50 : light.color),
  };
}

module.exports = { MIRED_MIN, MIRED_MAX, colorToMired, miredToColor, homekitValues };

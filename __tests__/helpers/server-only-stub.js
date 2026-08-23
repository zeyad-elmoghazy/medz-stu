// Jest-only stand-in for the 'server-only' package (see jest.config.ts
// moduleNameMapper). Real usage is a side-effect-only guard import; a
// no-op module satisfies that under Jest, where Next's own aliasing
// doesn't apply.
module.exports = {};

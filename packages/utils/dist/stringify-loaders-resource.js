"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const loaderToIdent = (data) => {
    if (!data.options) {
        return data.loader;
    }
    if (typeof data.options === 'string') {
        return data.loader + '?' + data.options;
    }
    if (typeof data.options !== 'object') {
        throw new Error('loader options must be string or object');
    }
    if (data.ident) {
        return data.loader + '??' + data.ident;
    }
    return data.loader + '?' + JSON.stringify(data.options);
};
const stringifyLoadersAndResource = (loaders, resource) => {
    let str = '';
    for (const loader of loaders) {
        str += loaderToIdent(loader) + '!';
    }
    return str + resource;
};
exports.default = stringifyLoadersAndResource;
module.exports.default && (module.exports = module.exports.default)
//# sourceMappingURL=stringify-loaders-resource.js.map

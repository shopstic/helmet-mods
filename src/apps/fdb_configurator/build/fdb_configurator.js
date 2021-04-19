class DenoStdInternalError extends Error {
    constructor(message){
        super(message);
        this.name = "DenoStdInternalError";
    }
}
function assert(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError(msg);
    }
}
function get(obj, key) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
        return obj[key];
    }
}
function getForce(obj, key) {
    const v = get(obj, key);
    assert(v != null);
    return v;
}
function isNumber(x) {
    if (typeof x === "number") return true;
    if (/^0x[0-9a-f]+$/i.test(String(x))) return true;
    return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(String(x));
}
function hasKey(obj, keys) {
    let o = obj;
    keys.slice(0, -1).forEach((key)=>{
        o = get(o, key) ?? {
        };
    });
    const key = keys[keys.length - 1];
    return key in o;
}
function parse(args, { "--": doubleDash = false , alias ={
} , boolean: __boolean = false , default: defaults = {
} , stopEarly =false , string =[] , unknown =(i)=>i
  } = {
}) {
    const flags = {
        bools: {
        },
        strings: {
        },
        unknownFn: unknown,
        allBools: false
    };
    if (__boolean !== undefined) {
        if (typeof __boolean === "boolean") {
            flags.allBools = !!__boolean;
        } else {
            const booleanArgs = typeof __boolean === "string" ? [
                __boolean
            ] : __boolean;
            for (const key of booleanArgs.filter(Boolean)){
                flags.bools[key] = true;
            }
        }
    }
    const aliases = {
    };
    if (alias !== undefined) {
        for(const key in alias){
            const val = getForce(alias, key);
            if (typeof val === "string") {
                aliases[key] = [
                    val
                ];
            } else {
                aliases[key] = val;
            }
            for (const alias1 of getForce(aliases, key)){
                aliases[alias1] = [
                    key
                ].concat(aliases[key].filter((y)=>alias1 !== y
                ));
            }
        }
    }
    if (string !== undefined) {
        const stringArgs = typeof string === "string" ? [
            string
        ] : string;
        for (const key of stringArgs.filter(Boolean)){
            flags.strings[key] = true;
            const alias1 = get(aliases, key);
            if (alias1) {
                for (const al of alias1){
                    flags.strings[al] = true;
                }
            }
        }
    }
    const argv = {
        _: []
    };
    function argDefined(key, arg) {
        return flags.allBools && /^--[^=]+$/.test(arg) || get(flags.bools, key) || !!get(flags.strings, key) || !!get(aliases, key);
    }
    function setKey(obj, keys, value) {
        let o = obj;
        keys.slice(0, -1).forEach(function(key) {
            if (get(o, key) === undefined) {
                o[key] = {
                };
            }
            o = get(o, key);
        });
        const key = keys[keys.length - 1];
        if (get(o, key) === undefined || get(flags.bools, key) || typeof get(o, key) === "boolean") {
            o[key] = value;
        } else if (Array.isArray(get(o, key))) {
            o[key].push(value);
        } else {
            o[key] = [
                get(o, key),
                value
            ];
        }
    }
    function setArg(key, val, arg = undefined) {
        if (arg && flags.unknownFn && !argDefined(key, arg)) {
            if (flags.unknownFn(arg, key, val) === false) return;
        }
        const value = !get(flags.strings, key) && isNumber(val) ? Number(val) : val;
        setKey(argv, key.split("."), value);
        const alias1 = get(aliases, key);
        if (alias1) {
            for (const x of alias1){
                setKey(argv, x.split("."), value);
            }
        }
    }
    function aliasIsBoolean(key) {
        return getForce(aliases, key).some((x)=>typeof get(flags.bools, x) === "boolean"
        );
    }
    for (const key of Object.keys(flags.bools)){
        setArg(key, defaults[key] === undefined ? false : defaults[key]);
    }
    let notFlags = [];
    if (args.includes("--")) {
        notFlags = args.slice(args.indexOf("--") + 1);
        args = args.slice(0, args.indexOf("--"));
    }
    for(let i = 0; i < args.length; i++){
        const arg = args[i];
        if (/^--.+=/.test(arg)) {
            const m = arg.match(/^--([^=]+)=(.*)$/s);
            assert(m != null);
            const [, key1, value] = m;
            if (flags.bools[key1]) {
                const booleanValue = value !== "false";
                setArg(key1, booleanValue, arg);
            } else {
                setArg(key1, value, arg);
            }
        } else if (/^--no-.+/.test(arg)) {
            const m = arg.match(/^--no-(.+)/);
            assert(m != null);
            setArg(m[1], false, arg);
        } else if (/^--.+/.test(arg)) {
            const m = arg.match(/^--(.+)/);
            assert(m != null);
            const [, key1] = m;
            const next = args[i + 1];
            if (next !== undefined && !/^-/.test(next) && !get(flags.bools, key1) && !flags.allBools && (get(aliases, key1) ? !aliasIsBoolean(key1) : true)) {
                setArg(key1, next, arg);
                i++;
            } else if (/^(true|false)$/.test(next)) {
                setArg(key1, next === "true", arg);
                i++;
            } else {
                setArg(key1, get(flags.strings, key1) ? "" : true, arg);
            }
        } else if (/^-[^-]+/.test(arg)) {
            const letters = arg.slice(1, -1).split("");
            let broken = false;
            for(let j = 0; j < letters.length; j++){
                const next = arg.slice(j + 2);
                if (next === "-") {
                    setArg(letters[j], next, arg);
                    continue;
                }
                if (/[A-Za-z]/.test(letters[j]) && /=/.test(next)) {
                    setArg(letters[j], next.split(/=(.+)/)[1], arg);
                    broken = true;
                    break;
                }
                if (/[A-Za-z]/.test(letters[j]) && /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) {
                    setArg(letters[j], next, arg);
                    broken = true;
                    break;
                }
                if (letters[j + 1] && letters[j + 1].match(/\W/)) {
                    setArg(letters[j], arg.slice(j + 2), arg);
                    broken = true;
                    break;
                } else {
                    setArg(letters[j], get(flags.strings, letters[j]) ? "" : true, arg);
                }
            }
            const [key1] = arg.slice(-1);
            if (!broken && key1 !== "-") {
                if (args[i + 1] && !/^(-|--)[^-]/.test(args[i + 1]) && !get(flags.bools, key1) && (get(aliases, key1) ? !aliasIsBoolean(key1) : true)) {
                    setArg(key1, args[i + 1], arg);
                    i++;
                } else if (args[i + 1] && /^(true|false)$/.test(args[i + 1])) {
                    setArg(key1, args[i + 1] === "true", arg);
                    i++;
                } else {
                    setArg(key1, get(flags.strings, key1) ? "" : true, arg);
                }
            }
        } else {
            if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
                argv._.push(flags.strings["_"] ?? !isNumber(arg) ? arg : Number(arg));
            }
            if (stopEarly) {
                argv._.push(...args.slice(i + 1));
                break;
            }
        }
    }
    for (const key1 of Object.keys(defaults)){
        if (!hasKey(argv, key1.split("."))) {
            setKey(argv, key1.split("."), defaults[key1]);
            if (aliases[key1]) {
                for (const x of aliases[key1]){
                    setKey(argv, x.split("."), defaults[key1]);
                }
            }
        }
    }
    if (doubleDash) {
        argv["--"] = [];
        for (const key2 of notFlags){
            argv["--"].push(key2);
        }
    } else {
        for (const key2 of notFlags){
            argv._.push(key2);
        }
    }
    return argv;
}
var fastDeepEqual = function equal(a, b) {
    if (a === b) return true;
    if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
            length = a.length;
            if (length != b.length) return false;
            for(i = length; (i--) !== 0;)if (!equal(a[i], b[i])) return false;
            return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for(i = length; (i--) !== 0;)if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for(i = length; (i--) !== 0;){
            var key = keys[i];
            if (!equal(a[key], b[key])) return false;
        }
        return true;
    }
    return a !== a && b !== b;
};
function createCommonjsModule(fn, basedir, module) {
    return module = {
        path: basedir,
        exports: {
        },
        require: function(path, base) {
            return commonjsRequire1(path, base === void 0 || base === null ? module.path : base);
        }
    }, fn(module, module.exports), module.exports;
}
function commonjsRequire1() {
    throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs");
}
var jsonSchemaTraverse = createCommonjsModule(function(module) {
    var traverse = module.exports = function(schema, opts, cb) {
        if (typeof opts == "function") {
            cb = opts;
            opts = {
            };
        }
        cb = opts.cb || cb;
        var pre = typeof cb == "function" ? cb : cb.pre || function() {
        };
        var post = cb.post || function() {
        };
        _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
        additionalItems: true,
        items: true,
        contains: true,
        additionalProperties: true,
        propertyNames: true,
        not: true,
        if: true,
        then: true,
        else: true
    };
    traverse.arrayKeywords = {
        items: true,
        allOf: true,
        anyOf: true,
        oneOf: true
    };
    traverse.propsKeywords = {
        $defs: true,
        definitions: true,
        properties: true,
        patternProperties: true,
        dependencies: true
    };
    traverse.skipKeywords = {
        default: true,
        enum: true,
        const: true,
        required: true,
        maximum: true,
        minimum: true,
        exclusiveMaximum: true,
        exclusiveMinimum: true,
        multipleOf: true,
        maxLength: true,
        minLength: true,
        pattern: true,
        format: true,
        maxItems: true,
        minItems: true,
        uniqueItems: true,
        maxProperties: true,
        minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
        if (schema && typeof schema == "object" && !Array.isArray(schema)) {
            pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
            for(var key in schema){
                var sch = schema[key];
                if (Array.isArray(sch)) {
                    if (key in traverse.arrayKeywords) {
                        for(var i = 0; i < sch.length; i++)_traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
                    }
                } else if (key in traverse.propsKeywords) {
                    if (sch && typeof sch == "object") {
                        for(var prop in sch)_traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
                    }
                } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
                    _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
                }
            }
            post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        }
    }
    function escapeJsonPtr(str) {
        return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
});
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {
};
function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function createCommonjsModule1(fn, basedir, module) {
    return module = {
        path: basedir,
        exports: {
        },
        require: function(path, base) {
            return commonjsRequire2(path, base === void 0 || base === null ? module.path : base);
        }
    }, fn(module, module.exports), module.exports;
}
function commonjsRequire2() {
    throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs");
}
var uri_all = createCommonjsModule1(function(module, exports) {
    (function(global2, factory) {
        factory(exports);
    })(commonjsGlobal, function(exports2) {
        function merge() {
            for(var _len = arguments.length, sets = Array(_len), _key = 0; _key < _len; _key++){
                sets[_key] = arguments[_key];
            }
            if (sets.length > 1) {
                sets[0] = sets[0].slice(0, -1);
                var xl = sets.length - 1;
                for(var x = 1; x < xl; ++x){
                    sets[x] = sets[x].slice(1, -1);
                }
                sets[xl] = sets[xl].slice(1);
                return sets.join("");
            } else {
                return sets[0];
            }
        }
        function subexp(str) {
            return "(?:" + str + ")";
        }
        function typeOf(o) {
            return o === void 0 ? "undefined" : o === null ? "null" : Object.prototype.toString.call(o).split(" ").pop().split("]").shift().toLowerCase();
        }
        function toUpperCase(str) {
            return str.toUpperCase();
        }
        function toArray(obj) {
            return obj !== void 0 && obj !== null ? obj instanceof Array ? obj : typeof obj.length !== "number" || obj.split || obj.setInterval || obj.call ? [
                obj
            ] : Array.prototype.slice.call(obj) : [];
        }
        function assign(target, source) {
            var obj = target;
            if (source) {
                for(var key in source){
                    obj[key] = source[key];
                }
            }
            return obj;
        }
        function buildExps(isIRI) {
            var ALPHA$$ = "[A-Za-z]", DIGIT$$ = "[0-9]", HEXDIG$$2 = merge(DIGIT$$, "[A-Fa-f]"), PCT_ENCODED$2 = subexp(subexp("%[EFef]" + HEXDIG$$2 + "%" + HEXDIG$$2 + HEXDIG$$2 + "%" + HEXDIG$$2 + HEXDIG$$2) + "|" + subexp("%[89A-Fa-f]" + HEXDIG$$2 + "%" + HEXDIG$$2 + HEXDIG$$2) + "|" + subexp("%" + HEXDIG$$2 + HEXDIG$$2)), GEN_DELIMS$$ = "[\\:\\/\\?\\#\\[\\]\\@]", SUB_DELIMS$$ = "[\\!\\$\\&\\'\\(\\)\\*\\+\\,\\;\\=]", RESERVED$$ = merge(GEN_DELIMS$$, SUB_DELIMS$$), UCSCHAR$$ = isIRI ? "[\\xA0-\\u200D\\u2010-\\u2029\\u202F-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF]" : "[]", IPRIVATE$$ = isIRI ? "[\\uE000-\\uF8FF]" : "[]", UNRESERVED$$2 = merge(ALPHA$$, DIGIT$$, "[\\-\\.\\_\\~]", UCSCHAR$$), SCHEME$ = subexp(ALPHA$$ + merge(ALPHA$$, DIGIT$$, "[\\+\\-\\.]") + "*"), USERINFO$ = subexp(subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\:]")) + "*"), DEC_OCTET_RELAXED$ = subexp(subexp("25[0-5]") + "|" + subexp("2[0-4]" + DIGIT$$) + "|" + subexp("1" + DIGIT$$ + DIGIT$$) + "|" + subexp("0?[1-9]" + DIGIT$$) + "|0?0?" + DIGIT$$), IPV4ADDRESS$ = subexp(DEC_OCTET_RELAXED$ + "\\." + DEC_OCTET_RELAXED$ + "\\." + DEC_OCTET_RELAXED$ + "\\." + DEC_OCTET_RELAXED$), H16$ = subexp(HEXDIG$$2 + "{1,4}"), LS32$ = subexp(subexp(H16$ + "\\:" + H16$) + "|" + IPV4ADDRESS$), IPV6ADDRESS1$ = subexp(subexp(H16$ + "\\:") + "{6}" + LS32$), IPV6ADDRESS2$ = subexp("\\:\\:" + subexp(H16$ + "\\:") + "{5}" + LS32$), IPV6ADDRESS3$ = subexp(subexp(H16$) + "?\\:\\:" + subexp(H16$ + "\\:") + "{4}" + LS32$), IPV6ADDRESS4$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,1}" + H16$) + "?\\:\\:" + subexp(H16$ + "\\:") + "{3}" + LS32$), IPV6ADDRESS5$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,2}" + H16$) + "?\\:\\:" + subexp(H16$ + "\\:") + "{2}" + LS32$), IPV6ADDRESS6$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,3}" + H16$) + "?\\:\\:" + H16$ + "\\:" + LS32$), IPV6ADDRESS7$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,4}" + H16$) + "?\\:\\:" + LS32$), IPV6ADDRESS8$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,5}" + H16$) + "?\\:\\:" + H16$), IPV6ADDRESS9$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,6}" + H16$) + "?\\:\\:"), IPV6ADDRESS$ = subexp([
                IPV6ADDRESS1$,
                IPV6ADDRESS2$,
                IPV6ADDRESS3$,
                IPV6ADDRESS4$,
                IPV6ADDRESS5$,
                IPV6ADDRESS6$,
                IPV6ADDRESS7$,
                IPV6ADDRESS8$,
                IPV6ADDRESS9$
            ].join("|")), ZONEID$ = subexp(subexp(UNRESERVED$$2 + "|" + PCT_ENCODED$2) + "+"), IPVFUTURE$ = subexp("[vV]" + HEXDIG$$2 + "+\\." + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\:]") + "+"), REG_NAME$ = subexp(subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$)) + "*"), PCHAR$ = subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\:\\@]")), SEGMENT_NZ_NC$ = subexp(subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\@]")) + "+"), QUERY$ = subexp(subexp(PCHAR$ + "|" + merge("[\\/\\?]", IPRIVATE$$)) + "*");
            return {
                NOT_SCHEME: new RegExp(merge("[^]", ALPHA$$, DIGIT$$, "[\\+\\-\\.]"), "g"),
                NOT_USERINFO: new RegExp(merge("[^\\%\\:]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
                NOT_HOST: new RegExp(merge("[^\\%\\[\\]\\:]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
                NOT_PATH: new RegExp(merge("[^\\%\\/\\:\\@]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
                NOT_PATH_NOSCHEME: new RegExp(merge("[^\\%\\/\\@]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
                NOT_QUERY: new RegExp(merge("[^\\%]", UNRESERVED$$2, SUB_DELIMS$$, "[\\:\\@\\/\\?]", IPRIVATE$$), "g"),
                NOT_FRAGMENT: new RegExp(merge("[^\\%]", UNRESERVED$$2, SUB_DELIMS$$, "[\\:\\@\\/\\?]"), "g"),
                ESCAPE: new RegExp(merge("[^]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
                UNRESERVED: new RegExp(UNRESERVED$$2, "g"),
                OTHER_CHARS: new RegExp(merge("[^\\%]", UNRESERVED$$2, RESERVED$$), "g"),
                PCT_ENCODED: new RegExp(PCT_ENCODED$2, "g"),
                IPV4ADDRESS: new RegExp("^(" + IPV4ADDRESS$ + ")$"),
                IPV6ADDRESS: new RegExp("^\\[?(" + IPV6ADDRESS$ + ")" + subexp(subexp("\\%25|\\%(?!" + HEXDIG$$2 + "{2})") + "(" + ZONEID$ + ")") + "?\\]?$")
            };
        }
        var URI_PROTOCOL = buildExps(false);
        var IRI_PROTOCOL = buildExps(true);
        var slicedToArray = function() {
            function sliceIterator(arr, i) {
                var _arr = [];
                var _n = true;
                var _d = false;
                var _e = void 0;
                try {
                    for(var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true){
                        _arr.push(_s.value);
                        if (i && _arr.length === i) break;
                    }
                } catch (err) {
                    _d = true;
                    _e = err;
                } finally{
                    try {
                        if (!_n && _i["return"]) _i["return"]();
                    } finally{
                        if (_d) throw _e;
                    }
                }
                return _arr;
            }
            return function(arr, i) {
                if (Array.isArray(arr)) {
                    return arr;
                } else if (Symbol.iterator in Object(arr)) {
                    return sliceIterator(arr, i);
                } else {
                    throw new TypeError("Invalid attempt to destructure non-iterable instance");
                }
            };
        }();
        var toConsumableArray = function(arr) {
            if (Array.isArray(arr)) {
                for(var i = 0, arr2 = Array(arr.length); i < arr.length; i++)arr2[i] = arr[i];
                return arr2;
            } else {
                return Array.from(arr);
            }
        };
        var maxInt = 2147483647;
        var base = 36;
        var tMin = 1;
        var tMax = 26;
        var skew = 38;
        var damp = 700;
        var initialBias = 72;
        var initialN = 128;
        var delimiter = "-";
        var regexPunycode = /^xn--/;
        var regexNonASCII = /[^\0-\x7E]/;
        var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
        var errors = {
            overflow: "Overflow: input needs wider integers to process",
            "not-basic": "Illegal input >= 0x80 (not a basic code point)",
            "invalid-input": "Invalid input"
        };
        var baseMinusTMin = base - tMin;
        var floor = Math.floor;
        var stringFromCharCode = String.fromCharCode;
        function error$1(type) {
            throw new RangeError(errors[type]);
        }
        function map(array, fn) {
            var result = [];
            var length = array.length;
            while(length--){
                result[length] = fn(array[length]);
            }
            return result;
        }
        function mapDomain(string, fn) {
            var parts = string.split("@");
            var result = "";
            if (parts.length > 1) {
                result = parts[0] + "@";
                string = parts[1];
            }
            string = string.replace(regexSeparators, ".");
            var labels = string.split(".");
            var encoded = map(labels, fn).join(".");
            return result + encoded;
        }
        function ucs2decode(string) {
            var output = [];
            var counter = 0;
            var length = string.length;
            while(counter < length){
                var value = string.charCodeAt(counter++);
                if (value >= 55296 && value <= 56319 && counter < length) {
                    var extra = string.charCodeAt(counter++);
                    if ((extra & 64512) == 56320) {
                        output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
                    } else {
                        output.push(value);
                        counter--;
                    }
                } else {
                    output.push(value);
                }
            }
            return output;
        }
        var ucs2encode = function ucs2encode2(array) {
            return String.fromCodePoint.apply(String, toConsumableArray(array));
        };
        var basicToDigit = function basicToDigit2(codePoint) {
            if (codePoint - 48 < 10) {
                return codePoint - 22;
            }
            if (codePoint - 65 < 26) {
                return codePoint - 65;
            }
            if (codePoint - 97 < 26) {
                return codePoint - 97;
            }
            return base;
        };
        var digitToBasic = function digitToBasic2(digit, flag) {
            return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
        };
        var adapt = function adapt2(delta, numPoints, firstTime) {
            var k = 0;
            delta = firstTime ? floor(delta / damp) : delta >> 1;
            delta += floor(delta / numPoints);
            for(; delta > baseMinusTMin * tMax >> 1; k += base){
                delta = floor(delta / baseMinusTMin);
            }
            return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
        };
        var decode = function decode2(input) {
            var output = [];
            var inputLength = input.length;
            var i = 0;
            var n = initialN;
            var bias = initialBias;
            var basic = input.lastIndexOf(delimiter);
            if (basic < 0) {
                basic = 0;
            }
            for(var j = 0; j < basic; ++j){
                if (input.charCodeAt(j) >= 128) {
                    error$1("not-basic");
                }
                output.push(input.charCodeAt(j));
            }
            for(var index = basic > 0 ? basic + 1 : 0; index < inputLength;){
                var oldi = i;
                for(var w = 1, k = base;; k += base){
                    if (index >= inputLength) {
                        error$1("invalid-input");
                    }
                    var digit = basicToDigit(input.charCodeAt(index++));
                    if (digit >= base || digit > floor((maxInt - i) / w)) {
                        error$1("overflow");
                    }
                    i += digit * w;
                    var t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
                    if (digit < t) {
                        break;
                    }
                    var baseMinusT = base - t;
                    if (w > floor(maxInt / baseMinusT)) {
                        error$1("overflow");
                    }
                    w *= baseMinusT;
                }
                var out = output.length + 1;
                bias = adapt(i - oldi, out, oldi == 0);
                if (floor(i / out) > maxInt - n) {
                    error$1("overflow");
                }
                n += floor(i / out);
                i %= out;
                output.splice(i++, 0, n);
            }
            return String.fromCodePoint.apply(String, output);
        };
        var encode = function encode2(input) {
            var output = [];
            input = ucs2decode(input);
            var inputLength = input.length;
            var n = initialN;
            var delta = 0;
            var bias = initialBias;
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = void 0;
            try {
                for(var _iterator = input[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                    var _currentValue2 = _step.value;
                    if (_currentValue2 < 128) {
                        output.push(stringFromCharCode(_currentValue2));
                    }
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally{
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally{
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
            var basicLength = output.length;
            var handledCPCount = basicLength;
            if (basicLength) {
                output.push(delimiter);
            }
            while(handledCPCount < inputLength){
                var m = maxInt;
                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = void 0;
                try {
                    for(var _iterator2 = input[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true){
                        var currentValue = _step2.value;
                        if (currentValue >= n && currentValue < m) {
                            m = currentValue;
                        }
                    }
                } catch (err) {
                    _didIteratorError2 = true;
                    _iteratorError2 = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion2 && _iterator2.return) {
                            _iterator2.return();
                        }
                    } finally{
                        if (_didIteratorError2) {
                            throw _iteratorError2;
                        }
                    }
                }
                var handledCPCountPlusOne = handledCPCount + 1;
                if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
                    error$1("overflow");
                }
                delta += (m - n) * handledCPCountPlusOne;
                n = m;
                var _iteratorNormalCompletion3 = true;
                var _didIteratorError3 = false;
                var _iteratorError3 = void 0;
                try {
                    for(var _iterator3 = input[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true){
                        var _currentValue = _step3.value;
                        if (_currentValue < n && (++delta) > maxInt) {
                            error$1("overflow");
                        }
                        if (_currentValue == n) {
                            var q = delta;
                            for(var k = base;; k += base){
                                var t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
                                if (q < t) {
                                    break;
                                }
                                var qMinusT = q - t;
                                var baseMinusT = base - t;
                                output.push(stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)));
                                q = floor(qMinusT / baseMinusT);
                            }
                            output.push(stringFromCharCode(digitToBasic(q, 0)));
                            bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
                            delta = 0;
                            ++handledCPCount;
                        }
                    }
                } catch (err) {
                    _didIteratorError3 = true;
                    _iteratorError3 = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion3 && _iterator3.return) {
                            _iterator3.return();
                        }
                    } finally{
                        if (_didIteratorError3) {
                            throw _iteratorError3;
                        }
                    }
                }
                ++delta;
                ++n;
            }
            return output.join("");
        };
        var toUnicode = function toUnicode2(input) {
            return mapDomain(input, function(string) {
                return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
            });
        };
        var toASCII = function toASCII2(input) {
            return mapDomain(input, function(string) {
                return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
            });
        };
        var punycode = {
            version: "2.1.0",
            ucs2: {
                decode: ucs2decode,
                encode: ucs2encode
            },
            decode,
            encode,
            toASCII,
            toUnicode
        };
        var SCHEMES2 = {
        };
        function pctEncChar2(chr) {
            var c = chr.charCodeAt(0);
            var e = void 0;
            if (c < 16) e = "%0" + c.toString(16).toUpperCase();
            else if (c < 128) e = "%" + c.toString(16).toUpperCase();
            else if (c < 2048) e = "%" + (c >> 6 | 192).toString(16).toUpperCase() + "%" + (c & 63 | 128).toString(16).toUpperCase();
            else e = "%" + (c >> 12 | 224).toString(16).toUpperCase() + "%" + (c >> 6 & 63 | 128).toString(16).toUpperCase() + "%" + (c & 63 | 128).toString(16).toUpperCase();
            return e;
        }
        function pctDecChars2(str) {
            var newStr = "";
            var i = 0;
            var il = str.length;
            while(i < il){
                var c = parseInt(str.substr(i + 1, 2), 16);
                if (c < 128) {
                    newStr += String.fromCharCode(c);
                    i += 3;
                } else if (c >= 194 && c < 224) {
                    if (il - i >= 6) {
                        var c2 = parseInt(str.substr(i + 4, 2), 16);
                        newStr += String.fromCharCode((c & 31) << 6 | c2 & 63);
                    } else {
                        newStr += str.substr(i, 6);
                    }
                    i += 6;
                } else if (c >= 224) {
                    if (il - i >= 9) {
                        var _c = parseInt(str.substr(i + 4, 2), 16);
                        var c3 = parseInt(str.substr(i + 7, 2), 16);
                        newStr += String.fromCharCode((c & 15) << 12 | (_c & 63) << 6 | c3 & 63);
                    } else {
                        newStr += str.substr(i, 9);
                    }
                    i += 9;
                } else {
                    newStr += str.substr(i, 3);
                    i += 3;
                }
            }
            return newStr;
        }
        function _normalizeComponentEncoding(components, protocol) {
            function decodeUnreserved2(str) {
                var decStr = pctDecChars2(str);
                return !decStr.match(protocol.UNRESERVED) ? str : decStr;
            }
            if (components.scheme) components.scheme = String(components.scheme).replace(protocol.PCT_ENCODED, decodeUnreserved2).toLowerCase().replace(protocol.NOT_SCHEME, "");
            if (components.userinfo !== void 0) components.userinfo = String(components.userinfo).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(protocol.NOT_USERINFO, pctEncChar2).replace(protocol.PCT_ENCODED, toUpperCase);
            if (components.host !== void 0) components.host = String(components.host).replace(protocol.PCT_ENCODED, decodeUnreserved2).toLowerCase().replace(protocol.NOT_HOST, pctEncChar2).replace(protocol.PCT_ENCODED, toUpperCase);
            if (components.path !== void 0) components.path = String(components.path).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(components.scheme ? protocol.NOT_PATH : protocol.NOT_PATH_NOSCHEME, pctEncChar2).replace(protocol.PCT_ENCODED, toUpperCase);
            if (components.query !== void 0) components.query = String(components.query).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(protocol.NOT_QUERY, pctEncChar2).replace(protocol.PCT_ENCODED, toUpperCase);
            if (components.fragment !== void 0) components.fragment = String(components.fragment).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(protocol.NOT_FRAGMENT, pctEncChar2).replace(protocol.PCT_ENCODED, toUpperCase);
            return components;
        }
        function _stripLeadingZeros(str) {
            return str.replace(/^0*(.*)/, "$1") || "0";
        }
        function _normalizeIPv4(host, protocol) {
            var matches = host.match(protocol.IPV4ADDRESS) || [];
            var _matches = slicedToArray(matches, 2), address = _matches[1];
            if (address) {
                return address.split(".").map(_stripLeadingZeros).join(".");
            } else {
                return host;
            }
        }
        function _normalizeIPv6(host, protocol) {
            var matches = host.match(protocol.IPV6ADDRESS) || [];
            var _matches2 = slicedToArray(matches, 3), address = _matches2[1], zone = _matches2[2];
            if (address) {
                var _address$toLowerCase$ = address.toLowerCase().split("::").reverse(), _address$toLowerCase$2 = slicedToArray(_address$toLowerCase$, 2), last = _address$toLowerCase$2[0], first = _address$toLowerCase$2[1];
                var firstFields = first ? first.split(":").map(_stripLeadingZeros) : [];
                var lastFields = last.split(":").map(_stripLeadingZeros);
                var isLastFieldIPv4Address = protocol.IPV4ADDRESS.test(lastFields[lastFields.length - 1]);
                var fieldCount = isLastFieldIPv4Address ? 7 : 8;
                var lastFieldsStart = lastFields.length - fieldCount;
                var fields = Array(fieldCount);
                for(var x = 0; x < fieldCount; ++x){
                    fields[x] = firstFields[x] || lastFields[lastFieldsStart + x] || "";
                }
                if (isLastFieldIPv4Address) {
                    fields[fieldCount - 1] = _normalizeIPv4(fields[fieldCount - 1], protocol);
                }
                var allZeroFields = fields.reduce(function(acc, field, index) {
                    if (!field || field === "0") {
                        var lastLongest = acc[acc.length - 1];
                        if (lastLongest && lastLongest.index + lastLongest.length === index) {
                            lastLongest.length++;
                        } else {
                            acc.push({
                                index,
                                length: 1
                            });
                        }
                    }
                    return acc;
                }, []);
                var longestZeroFields = allZeroFields.sort(function(a, b) {
                    return b.length - a.length;
                })[0];
                var newHost = void 0;
                if (longestZeroFields && longestZeroFields.length > 1) {
                    var newFirst = fields.slice(0, longestZeroFields.index);
                    var newLast = fields.slice(longestZeroFields.index + longestZeroFields.length);
                    newHost = newFirst.join(":") + "::" + newLast.join(":");
                } else {
                    newHost = fields.join(":");
                }
                if (zone) {
                    newHost += "%" + zone;
                }
                return newHost;
            } else {
                return host;
            }
        }
        var URI_PARSE = /^(?:([^:\/?#]+):)?(?:\/\/((?:([^\/?#@]*)@)?(\[[^\/?#\]]+\]|[^\/?#:]*)(?:\:(\d*))?))?([^?#]*)(?:\?([^#]*))?(?:#((?:.|\n|\r)*))?/i;
        var NO_MATCH_IS_UNDEFINED = "".match(/(){0}/)[1] === void 0;
        function parse2(uriString) {
            var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
            };
            var components = {
            };
            var protocol = options.iri !== false ? IRI_PROTOCOL : URI_PROTOCOL;
            if (options.reference === "suffix") uriString = (options.scheme ? options.scheme + ":" : "") + "//" + uriString;
            var matches = uriString.match(URI_PARSE);
            if (matches) {
                if (NO_MATCH_IS_UNDEFINED) {
                    components.scheme = matches[1];
                    components.userinfo = matches[3];
                    components.host = matches[4];
                    components.port = parseInt(matches[5], 10);
                    components.path = matches[6] || "";
                    components.query = matches[7];
                    components.fragment = matches[8];
                    if (isNaN(components.port)) {
                        components.port = matches[5];
                    }
                } else {
                    components.scheme = matches[1] || void 0;
                    components.userinfo = uriString.indexOf("@") !== -1 ? matches[3] : void 0;
                    components.host = uriString.indexOf("//") !== -1 ? matches[4] : void 0;
                    components.port = parseInt(matches[5], 10);
                    components.path = matches[6] || "";
                    components.query = uriString.indexOf("?") !== -1 ? matches[7] : void 0;
                    components.fragment = uriString.indexOf("#") !== -1 ? matches[8] : void 0;
                    if (isNaN(components.port)) {
                        components.port = uriString.match(/\/\/(?:.|\n)*\:(?:\/|\?|\#|$)/) ? matches[4] : void 0;
                    }
                }
                if (components.host) {
                    components.host = _normalizeIPv6(_normalizeIPv4(components.host, protocol), protocol);
                }
                if (components.scheme === void 0 && components.userinfo === void 0 && components.host === void 0 && components.port === void 0 && !components.path && components.query === void 0) {
                    components.reference = "same-document";
                } else if (components.scheme === void 0) {
                    components.reference = "relative";
                } else if (components.fragment === void 0) {
                    components.reference = "absolute";
                } else {
                    components.reference = "uri";
                }
                if (options.reference && options.reference !== "suffix" && options.reference !== components.reference) {
                    components.error = components.error || "URI is not a " + options.reference + " reference.";
                }
                var schemeHandler = SCHEMES2[(options.scheme || components.scheme || "").toLowerCase()];
                if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
                    if (components.host && (options.domainHost || schemeHandler && schemeHandler.domainHost)) {
                        try {
                            components.host = punycode.toASCII(components.host.replace(protocol.PCT_ENCODED, pctDecChars2).toLowerCase());
                        } catch (e) {
                            components.error = components.error || "Host's domain name can not be converted to ASCII via punycode: " + e;
                        }
                    }
                    _normalizeComponentEncoding(components, URI_PROTOCOL);
                } else {
                    _normalizeComponentEncoding(components, protocol);
                }
                if (schemeHandler && schemeHandler.parse) {
                    schemeHandler.parse(components, options);
                }
            } else {
                components.error = components.error || "URI can not be parsed.";
            }
            return components;
        }
        function _recomposeAuthority(components, options) {
            var protocol = options.iri !== false ? IRI_PROTOCOL : URI_PROTOCOL;
            var uriTokens = [];
            if (components.userinfo !== void 0) {
                uriTokens.push(components.userinfo);
                uriTokens.push("@");
            }
            if (components.host !== void 0) {
                uriTokens.push(_normalizeIPv6(_normalizeIPv4(String(components.host), protocol), protocol).replace(protocol.IPV6ADDRESS, function(_, $1, $2) {
                    return "[" + $1 + ($2 ? "%25" + $2 : "") + "]";
                }));
            }
            if (typeof components.port === "number" || typeof components.port === "string") {
                uriTokens.push(":");
                uriTokens.push(String(components.port));
            }
            return uriTokens.length ? uriTokens.join("") : void 0;
        }
        var RDS1 = /^\.\.?\//;
        var RDS2 = /^\/\.(\/|$)/;
        var RDS3 = /^\/\.\.(\/|$)/;
        var RDS5 = /^\/?(?:.|\n)*?(?=\/|$)/;
        function removeDotSegments2(input) {
            var output = [];
            while(input.length){
                if (input.match(RDS1)) {
                    input = input.replace(RDS1, "");
                } else if (input.match(RDS2)) {
                    input = input.replace(RDS2, "/");
                } else if (input.match(RDS3)) {
                    input = input.replace(RDS3, "/");
                    output.pop();
                } else if (input === "." || input === "..") {
                    input = "";
                } else {
                    var im = input.match(RDS5);
                    if (im) {
                        var s = im[0];
                        input = input.slice(s.length);
                        output.push(s);
                    } else {
                        throw new Error("Unexpected dot segment condition");
                    }
                }
            }
            return output.join("");
        }
        function serialize2(components) {
            var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
            };
            var protocol = options.iri ? IRI_PROTOCOL : URI_PROTOCOL;
            var uriTokens = [];
            var schemeHandler = SCHEMES2[(options.scheme || components.scheme || "").toLowerCase()];
            if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(components, options);
            if (components.host) {
                if (protocol.IPV6ADDRESS.test(components.host)) ;
                else if (options.domainHost || schemeHandler && schemeHandler.domainHost) {
                    try {
                        components.host = !options.iri ? punycode.toASCII(components.host.replace(protocol.PCT_ENCODED, pctDecChars2).toLowerCase()) : punycode.toUnicode(components.host);
                    } catch (e) {
                        components.error = components.error || "Host's domain name can not be converted to " + (!options.iri ? "ASCII" : "Unicode") + " via punycode: " + e;
                    }
                }
            }
            _normalizeComponentEncoding(components, protocol);
            if (options.reference !== "suffix" && components.scheme) {
                uriTokens.push(components.scheme);
                uriTokens.push(":");
            }
            var authority = _recomposeAuthority(components, options);
            if (authority !== void 0) {
                if (options.reference !== "suffix") {
                    uriTokens.push("//");
                }
                uriTokens.push(authority);
                if (components.path && components.path.charAt(0) !== "/") {
                    uriTokens.push("/");
                }
            }
            if (components.path !== void 0) {
                var s = components.path;
                if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
                    s = removeDotSegments2(s);
                }
                if (authority === void 0) {
                    s = s.replace(/^\/\//, "/%2F");
                }
                uriTokens.push(s);
            }
            if (components.query !== void 0) {
                uriTokens.push("?");
                uriTokens.push(components.query);
            }
            if (components.fragment !== void 0) {
                uriTokens.push("#");
                uriTokens.push(components.fragment);
            }
            return uriTokens.join("");
        }
        function resolveComponents2(base2, relative) {
            var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {
            };
            var skipNormalization = arguments[3];
            var target = {
            };
            if (!skipNormalization) {
                base2 = parse2(serialize2(base2, options), options);
                relative = parse2(serialize2(relative, options), options);
            }
            options = options || {
            };
            if (!options.tolerant && relative.scheme) {
                target.scheme = relative.scheme;
                target.userinfo = relative.userinfo;
                target.host = relative.host;
                target.port = relative.port;
                target.path = removeDotSegments2(relative.path || "");
                target.query = relative.query;
            } else {
                if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
                    target.userinfo = relative.userinfo;
                    target.host = relative.host;
                    target.port = relative.port;
                    target.path = removeDotSegments2(relative.path || "");
                    target.query = relative.query;
                } else {
                    if (!relative.path) {
                        target.path = base2.path;
                        if (relative.query !== void 0) {
                            target.query = relative.query;
                        } else {
                            target.query = base2.query;
                        }
                    } else {
                        if (relative.path.charAt(0) === "/") {
                            target.path = removeDotSegments2(relative.path);
                        } else {
                            if ((base2.userinfo !== void 0 || base2.host !== void 0 || base2.port !== void 0) && !base2.path) {
                                target.path = "/" + relative.path;
                            } else if (!base2.path) {
                                target.path = relative.path;
                            } else {
                                target.path = base2.path.slice(0, base2.path.lastIndexOf("/") + 1) + relative.path;
                            }
                            target.path = removeDotSegments2(target.path);
                        }
                        target.query = relative.query;
                    }
                    target.userinfo = base2.userinfo;
                    target.host = base2.host;
                    target.port = base2.port;
                }
                target.scheme = base2.scheme;
            }
            target.fragment = relative.fragment;
            return target;
        }
        function resolve2(baseURI, relativeURI, options) {
            var schemelessOptions = assign({
                scheme: "null"
            }, options);
            return serialize2(resolveComponents2(parse2(baseURI, schemelessOptions), parse2(relativeURI, schemelessOptions), schemelessOptions, true), schemelessOptions);
        }
        function normalize2(uri, options) {
            if (typeof uri === "string") {
                uri = serialize2(parse2(uri, options), options);
            } else if (typeOf(uri) === "object") {
                uri = parse2(serialize2(uri, options), options);
            }
            return uri;
        }
        function equal2(uriA, uriB, options) {
            if (typeof uriA === "string") {
                uriA = serialize2(parse2(uriA, options), options);
            } else if (typeOf(uriA) === "object") {
                uriA = serialize2(uriA, options);
            }
            if (typeof uriB === "string") {
                uriB = serialize2(parse2(uriB, options), options);
            } else if (typeOf(uriB) === "object") {
                uriB = serialize2(uriB, options);
            }
            return uriA === uriB;
        }
        function escapeComponent2(str, options) {
            return str && str.toString().replace(!options || !options.iri ? URI_PROTOCOL.ESCAPE : IRI_PROTOCOL.ESCAPE, pctEncChar2);
        }
        function unescapeComponent2(str, options) {
            return str && str.toString().replace(!options || !options.iri ? URI_PROTOCOL.PCT_ENCODED : IRI_PROTOCOL.PCT_ENCODED, pctDecChars2);
        }
        var handler = {
            scheme: "http",
            domainHost: true,
            parse: function parse3(components, options) {
                if (!components.host) {
                    components.error = components.error || "HTTP URIs must have a host.";
                }
                return components;
            },
            serialize: function serialize3(components, options) {
                var secure = String(components.scheme).toLowerCase() === "https";
                if (components.port === (secure ? 443 : 80) || components.port === "") {
                    components.port = void 0;
                }
                if (!components.path) {
                    components.path = "/";
                }
                return components;
            }
        };
        var handler$1 = {
            scheme: "https",
            domainHost: handler.domainHost,
            parse: handler.parse,
            serialize: handler.serialize
        };
        function isSecure(wsComponents) {
            return typeof wsComponents.secure === "boolean" ? wsComponents.secure : String(wsComponents.scheme).toLowerCase() === "wss";
        }
        var handler$2 = {
            scheme: "ws",
            domainHost: true,
            parse: function parse3(components, options) {
                var wsComponents = components;
                wsComponents.secure = isSecure(wsComponents);
                wsComponents.resourceName = (wsComponents.path || "/") + (wsComponents.query ? "?" + wsComponents.query : "");
                wsComponents.path = void 0;
                wsComponents.query = void 0;
                return wsComponents;
            },
            serialize: function serialize3(wsComponents, options) {
                if (wsComponents.port === (isSecure(wsComponents) ? 443 : 80) || wsComponents.port === "") {
                    wsComponents.port = void 0;
                }
                if (typeof wsComponents.secure === "boolean") {
                    wsComponents.scheme = wsComponents.secure ? "wss" : "ws";
                    wsComponents.secure = void 0;
                }
                if (wsComponents.resourceName) {
                    var _wsComponents$resourc = wsComponents.resourceName.split("?"), _wsComponents$resourc2 = slicedToArray(_wsComponents$resourc, 2), path = _wsComponents$resourc2[0], query = _wsComponents$resourc2[1];
                    wsComponents.path = path && path !== "/" ? path : void 0;
                    wsComponents.query = query;
                    wsComponents.resourceName = void 0;
                }
                wsComponents.fragment = void 0;
                return wsComponents;
            }
        };
        var handler$3 = {
            scheme: "wss",
            domainHost: handler$2.domainHost,
            parse: handler$2.parse,
            serialize: handler$2.serialize
        };
        var O = {
        };
        var UNRESERVED$$ = "[A-Za-z0-9\\-\\.\\_\\~\\xA0-\\u200D\\u2010-\\u2029\\u202F-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF]";
        var HEXDIG$$ = "[0-9A-Fa-f]";
        var PCT_ENCODED$ = subexp(subexp("%[EFef]" + HEXDIG$$ + "%" + HEXDIG$$ + HEXDIG$$ + "%" + HEXDIG$$ + HEXDIG$$) + "|" + subexp("%[89A-Fa-f]" + HEXDIG$$ + "%" + HEXDIG$$ + HEXDIG$$) + "|" + subexp("%" + HEXDIG$$ + HEXDIG$$));
        var ATEXT$$ = "[A-Za-z0-9\\!\\$\\%\\'\\*\\+\\-\\^\\_\\`\\{\\|\\}\\~]";
        var QTEXT$$ = "[\\!\\$\\%\\'\\(\\)\\*\\+\\,\\-\\.0-9\\<\\>A-Z\\x5E-\\x7E]";
        var VCHAR$$ = merge(QTEXT$$, '[\\"\\\\]');
        var SOME_DELIMS$$ = "[\\!\\$\\'\\(\\)\\*\\+\\,\\;\\:\\@]";
        var UNRESERVED = new RegExp(UNRESERVED$$, "g");
        var PCT_ENCODED = new RegExp(PCT_ENCODED$, "g");
        var NOT_LOCAL_PART = new RegExp(merge("[^]", ATEXT$$, "[\\.]", '[\\"]', VCHAR$$), "g");
        var NOT_HFNAME = new RegExp(merge("[^]", UNRESERVED$$, SOME_DELIMS$$), "g");
        var NOT_HFVALUE = NOT_HFNAME;
        function decodeUnreserved(str) {
            var decStr = pctDecChars2(str);
            return !decStr.match(UNRESERVED) ? str : decStr;
        }
        var handler$4 = {
            scheme: "mailto",
            parse: function parse$$1(components, options) {
                var mailtoComponents = components;
                var to = mailtoComponents.to = mailtoComponents.path ? mailtoComponents.path.split(",") : [];
                mailtoComponents.path = void 0;
                if (mailtoComponents.query) {
                    var unknownHeaders = false;
                    var headers = {
                    };
                    var hfields = mailtoComponents.query.split("&");
                    for(var x = 0, xl = hfields.length; x < xl; ++x){
                        var hfield = hfields[x].split("=");
                        switch(hfield[0]){
                            case "to":
                                var toAddrs = hfield[1].split(",");
                                for(var _x = 0, _xl = toAddrs.length; _x < _xl; ++_x){
                                    to.push(toAddrs[_x]);
                                }
                                break;
                            case "subject":
                                mailtoComponents.subject = unescapeComponent2(hfield[1], options);
                                break;
                            case "body":
                                mailtoComponents.body = unescapeComponent2(hfield[1], options);
                                break;
                            default:
                                unknownHeaders = true;
                                headers[unescapeComponent2(hfield[0], options)] = unescapeComponent2(hfield[1], options);
                                break;
                        }
                    }
                    if (unknownHeaders) mailtoComponents.headers = headers;
                }
                mailtoComponents.query = void 0;
                for(var _x2 = 0, _xl2 = to.length; _x2 < _xl2; ++_x2){
                    var addr = to[_x2].split("@");
                    addr[0] = unescapeComponent2(addr[0]);
                    if (!options.unicodeSupport) {
                        try {
                            addr[1] = punycode.toASCII(unescapeComponent2(addr[1], options).toLowerCase());
                        } catch (e) {
                            mailtoComponents.error = mailtoComponents.error || "Email address's domain name can not be converted to ASCII via punycode: " + e;
                        }
                    } else {
                        addr[1] = unescapeComponent2(addr[1], options).toLowerCase();
                    }
                    to[_x2] = addr.join("@");
                }
                return mailtoComponents;
            },
            serialize: function serialize$$1(mailtoComponents, options) {
                var components = mailtoComponents;
                var to = toArray(mailtoComponents.to);
                if (to) {
                    for(var x = 0, xl = to.length; x < xl; ++x){
                        var toAddr = String(to[x]);
                        var atIdx = toAddr.lastIndexOf("@");
                        var localPart = toAddr.slice(0, atIdx).replace(PCT_ENCODED, decodeUnreserved).replace(PCT_ENCODED, toUpperCase).replace(NOT_LOCAL_PART, pctEncChar2);
                        var domain = toAddr.slice(atIdx + 1);
                        try {
                            domain = !options.iri ? punycode.toASCII(unescapeComponent2(domain, options).toLowerCase()) : punycode.toUnicode(domain);
                        } catch (e) {
                            components.error = components.error || "Email address's domain name can not be converted to " + (!options.iri ? "ASCII" : "Unicode") + " via punycode: " + e;
                        }
                        to[x] = localPart + "@" + domain;
                    }
                    components.path = to.join(",");
                }
                var headers = mailtoComponents.headers = mailtoComponents.headers || {
                };
                if (mailtoComponents.subject) headers["subject"] = mailtoComponents.subject;
                if (mailtoComponents.body) headers["body"] = mailtoComponents.body;
                var fields = [];
                for(var name in headers){
                    if (headers[name] !== O[name]) {
                        fields.push(name.replace(PCT_ENCODED, decodeUnreserved).replace(PCT_ENCODED, toUpperCase).replace(NOT_HFNAME, pctEncChar2) + "=" + headers[name].replace(PCT_ENCODED, decodeUnreserved).replace(PCT_ENCODED, toUpperCase).replace(NOT_HFVALUE, pctEncChar2));
                    }
                }
                if (fields.length) {
                    components.query = fields.join("&");
                }
                return components;
            }
        };
        var URN_PARSE = /^([^\:]+)\:(.*)/;
        var handler$5 = {
            scheme: "urn",
            parse: function parse$$1(components, options) {
                var matches = components.path && components.path.match(URN_PARSE);
                var urnComponents = components;
                if (matches) {
                    var scheme = options.scheme || urnComponents.scheme || "urn";
                    var nid = matches[1].toLowerCase();
                    var nss = matches[2];
                    var urnScheme = scheme + ":" + (options.nid || nid);
                    var schemeHandler = SCHEMES2[urnScheme];
                    urnComponents.nid = nid;
                    urnComponents.nss = nss;
                    urnComponents.path = void 0;
                    if (schemeHandler) {
                        urnComponents = schemeHandler.parse(urnComponents, options);
                    }
                } else {
                    urnComponents.error = urnComponents.error || "URN can not be parsed.";
                }
                return urnComponents;
            },
            serialize: function serialize$$1(urnComponents, options) {
                var scheme = options.scheme || urnComponents.scheme || "urn";
                var nid = urnComponents.nid;
                var urnScheme = scheme + ":" + (options.nid || nid);
                var schemeHandler = SCHEMES2[urnScheme];
                if (schemeHandler) {
                    urnComponents = schemeHandler.serialize(urnComponents, options);
                }
                var uriComponents = urnComponents;
                var nss = urnComponents.nss;
                uriComponents.path = (nid || options.nid) + ":" + nss;
                return uriComponents;
            }
        };
        var UUID = /^[0-9A-Fa-f]{8}(?:\-[0-9A-Fa-f]{4}){3}\-[0-9A-Fa-f]{12}$/;
        var handler$6 = {
            scheme: "urn:uuid",
            parse: function parse3(urnComponents, options) {
                var uuidComponents = urnComponents;
                uuidComponents.uuid = uuidComponents.nss;
                uuidComponents.nss = void 0;
                if (!options.tolerant && (!uuidComponents.uuid || !uuidComponents.uuid.match(UUID))) {
                    uuidComponents.error = uuidComponents.error || "UUID is not valid.";
                }
                return uuidComponents;
            },
            serialize: function serialize3(uuidComponents, options) {
                var urnComponents = uuidComponents;
                urnComponents.nss = (uuidComponents.uuid || "").toLowerCase();
                return urnComponents;
            }
        };
        SCHEMES2[handler.scheme] = handler;
        SCHEMES2[handler$1.scheme] = handler$1;
        SCHEMES2[handler$2.scheme] = handler$2;
        SCHEMES2[handler$3.scheme] = handler$3;
        SCHEMES2[handler$4.scheme] = handler$4;
        SCHEMES2[handler$5.scheme] = handler$5;
        SCHEMES2[handler$6.scheme] = handler$6;
        exports2.SCHEMES = SCHEMES2;
        exports2.pctEncChar = pctEncChar2;
        exports2.pctDecChars = pctDecChars2;
        exports2.parse = parse2;
        exports2.removeDotSegments = removeDotSegments2;
        exports2.serialize = serialize2;
        exports2.resolveComponents = resolveComponents2;
        exports2.resolve = resolve2;
        exports2.normalize = normalize2;
        exports2.equal = equal2;
        exports2.escapeComponent = escapeComponent2;
        exports2.unescapeComponent = unescapeComponent2;
        Object.defineProperty(exports2, "__esModule", {
            value: true
        });
    });
});
var __pika_web_default_export_for_treeshaking__ = getDefaultExportFromCjs(uri_all);
function getDefaultExportFromCjs1(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function createCommonjsModule2(fn, basedir, module) {
    return module = {
        path: basedir,
        exports: {
        },
        require: function(path, base) {
            return commonjsRequire3(path, base === void 0 || base === null ? module.path : base);
        }
    }, fn(module, module.exports), module.exports;
}
function commonjsRequire3() {
    throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs");
}
var code1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.regexpCode = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    class _CodeOrName {
    }
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    class Name2 extends _CodeOrName {
        constructor(s){
            super();
            if (!exports.IDENTIFIER.test(s)) throw new Error("CodeGen: name must be a valid identifier");
            this.str = s;
        }
        toString() {
            return this.str;
        }
        emptyStr() {
            return false;
        }
        get names() {
            return {
                [this.str]: 1
            };
        }
    }
    exports.Name = Name2;
    class _Code extends _CodeOrName {
        constructor(code2){
            super();
            this._items = typeof code2 === "string" ? [
                code2
            ] : code2;
        }
        toString() {
            return this.str;
        }
        emptyStr() {
            if (this._items.length > 1) return false;
            const item = this._items[0];
            return item === "" || item === '""';
        }
        get str() {
            var _a;
            return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s1, c)=>`${s1}${c}`
            , "");
        }
        get names() {
            var _a;
            return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c)=>{
                if (c instanceof Name2) names[c.str] = (names[c.str] || 0) + 1;
                return names;
            }, {
            });
        }
    }
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _2(strs, ...args) {
        const code21 = [
            strs[0]
        ];
        let i = 0;
        while(i < args.length){
            addCodeArg(code21, args[i]);
            code21.push(strs[++i]);
        }
        return new _Code(code21);
    }
    exports._ = _2;
    const plus = new _Code("+");
    function str2(strs, ...args) {
        const expr = [
            safeStringify(strs[0])
        ];
        let i = 0;
        while(i < args.length){
            expr.push(plus);
            addCodeArg(expr, args[i]);
            expr.push(plus, safeStringify(strs[++i]));
        }
        optimize(expr);
        return new _Code(expr);
    }
    exports.str = str2;
    function addCodeArg(code21, arg) {
        if (arg instanceof _Code) code21.push(...arg._items);
        else if (arg instanceof Name2) code21.push(arg);
        else code21.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
        let i = 1;
        while(i < expr.length - 1){
            if (expr[i] === plus) {
                const res = mergeExprItems(expr[i - 1], expr[i + 1]);
                if (res !== void 0) {
                    expr.splice(i - 1, 3, res);
                    continue;
                }
                expr[i++] = "+";
            }
            i++;
        }
    }
    function mergeExprItems(a, b) {
        if (b === '""') return a;
        if (a === '""') return b;
        if (typeof a == "string") {
            if (b instanceof Name2 || a[a.length - 1] !== '"') return;
            if (typeof b != "string") return `${a.slice(0, -1)}${b}"`;
            if (b[0] === '"') return a.slice(0, -1) + b.slice(1);
            return;
        }
        if (typeof b == "string" && b[0] === '"' && !(a instanceof Name2)) return `"${a}${b.slice(1)}`;
        return;
    }
    function strConcat(c1, c2) {
        return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str2`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
        return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify2(x) {
        return new _Code(safeStringify(x));
    }
    exports.stringify = stringify2;
    function safeStringify(x) {
        return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
        return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _2`[${key}]`;
    }
    exports.getProperty = getProperty;
    function regexpCode(rx) {
        return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
});
var scope = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    class ValueError extends Error {
        constructor(name){
            super(`CodeGen: "code" for ${name} not defined`);
            this.value = name.value;
        }
    }
    var UsedValueState;
    (function(UsedValueState2) {
        UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
        UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState = exports.UsedValueState || (exports.UsedValueState = {
    }));
    exports.varKinds = {
        const: new code1.Name("const"),
        let: new code1.Name("let"),
        var: new code1.Name("var")
    };
    class Scope {
        constructor({ prefixes , parent  } = {
        }){
            this._names = {
            };
            this._prefixes = prefixes;
            this._parent = parent;
        }
        toName(nameOrPrefix) {
            return nameOrPrefix instanceof code1.Name ? nameOrPrefix : this.name(nameOrPrefix);
        }
        name(prefix) {
            return new code1.Name(this._newName(prefix));
        }
        _newName(prefix) {
            const ng = this._names[prefix] || this._nameGroup(prefix);
            return `${prefix}${ng.index++}`;
        }
        _nameGroup(prefix) {
            var _a, _b;
            if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
                throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
            }
            return this._names[prefix] = {
                prefix,
                index: 0
            };
        }
    }
    exports.Scope = Scope;
    class ValueScopeName extends code1.Name {
        constructor(prefix1, nameStr){
            super(nameStr);
            this.prefix = prefix1;
        }
        setValue(value, { property , itemIndex  }) {
            this.value = value;
            this.scopePath = code1._`.${new code1.Name(property)}[${itemIndex}]`;
        }
    }
    exports.ValueScopeName = ValueScopeName;
    const line = code1._`\n`;
    class ValueScope extends Scope {
        constructor(opts){
            super(opts);
            this._values = {
            };
            this._scope = opts.scope;
            this.opts = {
                ...opts,
                _n: opts.lines ? line : code1.nil
            };
        }
        get() {
            return this._scope;
        }
        name(prefix) {
            return new ValueScopeName(prefix, this._newName(prefix));
        }
        value(nameOrPrefix, value) {
            var _a;
            if (value.ref === void 0) throw new Error("CodeGen: ref must be passed in value");
            const name1 = this.toName(nameOrPrefix);
            const { prefix: prefix2  } = name1;
            const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
            let vs = this._values[prefix2];
            if (vs) {
                const _name = vs.get(valueKey);
                if (_name) return _name;
            } else {
                vs = this._values[prefix2] = new Map();
            }
            vs.set(valueKey, name1);
            const s = this._scope[prefix2] || (this._scope[prefix2] = []);
            const itemIndex = s.length;
            s[itemIndex] = value.ref;
            name1.setValue(value, {
                property: prefix2,
                itemIndex
            });
            return name1;
        }
        getValue(prefix, keyOrRef) {
            const vs = this._values[prefix];
            if (!vs) return;
            return vs.get(keyOrRef);
        }
        scopeRefs(scopeName, values = this._values) {
            return this._reduceValues(values, (name1)=>{
                if (name1.scopePath === void 0) throw new Error(`CodeGen: name "${name1}" has no value`);
                return code1._`${scopeName}${name1.scopePath}`;
            });
        }
        scopeCode(values = this._values, usedValues, getCode) {
            return this._reduceValues(values, (name1)=>{
                if (name1.value === void 0) throw new Error(`CodeGen: name "${name1}" has no value`);
                return name1.value.code;
            }, usedValues, getCode);
        }
        _reduceValues(values, valueCode, usedValues = {
        }, getCode) {
            let code$12 = code1.nil;
            for(const prefix2 in values){
                const vs = values[prefix2];
                if (!vs) continue;
                const nameSet = usedValues[prefix2] = usedValues[prefix2] || new Map();
                vs.forEach((name1)=>{
                    if (nameSet.has(name1)) return;
                    nameSet.set(name1, UsedValueState.Started);
                    let c = valueCode(name1);
                    if (c) {
                        const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
                        code$12 = code1._`${code$12}${def} ${name1} = ${c};${this.opts._n}`;
                    } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name1)) {
                        code$12 = code1._`${code$12}${c}${this.opts._n}`;
                    } else {
                        throw new ValueError(name1);
                    }
                    nameSet.set(name1, UsedValueState.Completed);
                });
            }
            return code$12;
        }
    }
    exports.ValueScope = ValueScope;
});
var codegen = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_2 = code1;
    Object.defineProperty(exports, "_", {
        enumerable: true,
        get: function() {
            return code_2._;
        }
    });
    Object.defineProperty(exports, "str", {
        enumerable: true,
        get: function() {
            return code_2.str;
        }
    });
    Object.defineProperty(exports, "strConcat", {
        enumerable: true,
        get: function() {
            return code_2.strConcat;
        }
    });
    Object.defineProperty(exports, "nil", {
        enumerable: true,
        get: function() {
            return code_2.nil;
        }
    });
    Object.defineProperty(exports, "getProperty", {
        enumerable: true,
        get: function() {
            return code_2.getProperty;
        }
    });
    Object.defineProperty(exports, "stringify", {
        enumerable: true,
        get: function() {
            return code_2.stringify;
        }
    });
    Object.defineProperty(exports, "regexpCode", {
        enumerable: true,
        get: function() {
            return code_2.regexpCode;
        }
    });
    Object.defineProperty(exports, "Name", {
        enumerable: true,
        get: function() {
            return code_2.Name;
        }
    });
    var scope_2 = scope;
    Object.defineProperty(exports, "Scope", {
        enumerable: true,
        get: function() {
            return scope_2.Scope;
        }
    });
    Object.defineProperty(exports, "ValueScope", {
        enumerable: true,
        get: function() {
            return scope_2.ValueScope;
        }
    });
    Object.defineProperty(exports, "ValueScopeName", {
        enumerable: true,
        get: function() {
            return scope_2.ValueScopeName;
        }
    });
    Object.defineProperty(exports, "varKinds", {
        enumerable: true,
        get: function() {
            return scope_2.varKinds;
        }
    });
    exports.operators = {
        GT: new code1._Code(">"),
        GTE: new code1._Code(">="),
        LT: new code1._Code("<"),
        LTE: new code1._Code("<="),
        EQ: new code1._Code("==="),
        NEQ: new code1._Code("!=="),
        NOT: new code1._Code("!"),
        OR: new code1._Code("||"),
        AND: new code1._Code("&&"),
        ADD: new code1._Code("+")
    };
    class Node1 {
        optimizeNodes() {
            return this;
        }
        optimizeNames(_names, _constants) {
            return this;
        }
    }
    class Def extends Node1 {
        constructor(varKind3, name4, rhs3){
            super();
            this.varKind = varKind3;
            this.name = name4;
            this.rhs = rhs3;
        }
        render({ es5 , _n  }) {
            const varKind1 = es5 ? scope.varKinds.var : this.varKind;
            const rhs1 = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
            return `${varKind1} ${this.name}${rhs1};` + _n;
        }
        optimizeNames(names, constants) {
            if (!names[this.name.str]) return;
            if (this.rhs) this.rhs = optimizeExpr(this.rhs, names, constants);
            return this;
        }
        get names() {
            return this.rhs instanceof code1._CodeOrName ? this.rhs.names : {
            };
        }
    }
    class Assign extends Node1 {
        constructor(lhs2, rhs1, sideEffects2){
            super();
            this.lhs = lhs2;
            this.rhs = rhs1;
            this.sideEffects = sideEffects2;
        }
        render({ _n  }) {
            return `${this.lhs} = ${this.rhs};` + _n;
        }
        optimizeNames(names, constants) {
            if (this.lhs instanceof code1.Name && !names[this.lhs.str] && !this.sideEffects) return;
            this.rhs = optimizeExpr(this.rhs, names, constants);
            return this;
        }
        get names() {
            const names = this.lhs instanceof code1.Name ? {
            } : {
                ...this.lhs.names
            };
            return addExprNames(names, this.rhs);
        }
    }
    class AssignOp extends Assign {
        constructor(lhs1, op, rhs2, sideEffects1){
            super(lhs1, rhs2, sideEffects1);
            this.op = op;
        }
        render({ _n  }) {
            return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
        }
    }
    class Label extends Node1 {
        constructor(label2){
            super();
            this.label = label2;
            this.names = {
            };
        }
        render({ _n  }) {
            return `${this.label}:` + _n;
        }
    }
    class Break extends Node1 {
        constructor(label1){
            super();
            this.label = label1;
            this.names = {
            };
        }
        render({ _n  }) {
            const label2 = this.label ? ` ${this.label}` : "";
            return `break${label2};` + _n;
        }
    }
    class Throw extends Node1 {
        constructor(error2){
            super();
            this.error = error2;
        }
        render({ _n  }) {
            return `throw ${this.error};` + _n;
        }
        get names() {
            return this.error.names;
        }
    }
    class AnyCode extends Node1 {
        constructor(code2){
            super();
            this.code = code2;
        }
        render({ _n  }) {
            return `${this.code};` + _n;
        }
        optimizeNodes() {
            return `${this.code}` ? this : void 0;
        }
        optimizeNames(names, constants) {
            this.code = optimizeExpr(this.code, names, constants);
            return this;
        }
        get names() {
            return this.code instanceof code1._CodeOrName ? this.code.names : {
            };
        }
    }
    class ParentNode extends Node1 {
        constructor(nodes = []){
            super();
            this.nodes = nodes;
        }
        render(opts) {
            return this.nodes.reduce((code21, n)=>code21 + n.render(opts)
            , "");
        }
        optimizeNodes() {
            const { nodes: nodes1  } = this;
            let i = nodes1.length;
            while(i--){
                const n = nodes1[i].optimizeNodes();
                if (Array.isArray(n)) nodes1.splice(i, 1, ...n);
                else if (n) nodes1[i] = n;
                else nodes1.splice(i, 1);
            }
            return nodes1.length > 0 ? this : void 0;
        }
        optimizeNames(names, constants) {
            const { nodes: nodes1  } = this;
            let i = nodes1.length;
            while(i--){
                const n = nodes1[i];
                if (n.optimizeNames(names, constants)) continue;
                subtractNames(names, n.names);
                nodes1.splice(i, 1);
            }
            return nodes1.length > 0 ? this : void 0;
        }
        get names() {
            return this.nodes.reduce((names, n)=>addNames(names, n.names)
            , {
            });
        }
    }
    class BlockNode extends ParentNode {
        render(opts) {
            return "{" + opts._n + super.render(opts) + "}" + opts._n;
        }
    }
    class Root extends ParentNode {
    }
    class Else extends BlockNode {
    }
    Else.kind = "else";
    class If extends BlockNode {
        constructor(condition1, nodes1){
            super(nodes1);
            this.condition = condition1;
        }
        render(opts) {
            let code21 = `if(${this.condition})` + super.render(opts);
            if (this.else) code21 += "else " + this.else.render(opts);
            return code21;
        }
        optimizeNodes() {
            super.optimizeNodes();
            const cond = this.condition;
            if (cond === true) return this.nodes;
            let e = this.else;
            if (e) {
                const ns = e.optimizeNodes();
                e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
            }
            if (e) {
                if (cond === false) return e instanceof If ? e : e.nodes;
                if (this.nodes.length) return this;
                return new If(not2(cond), e instanceof If ? [
                    e
                ] : e.nodes);
            }
            if (cond === false || !this.nodes.length) return void 0;
            return this;
        }
        optimizeNames(names, constants) {
            var _a;
            this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
            if (!(super.optimizeNames(names, constants) || this.else)) return;
            this.condition = optimizeExpr(this.condition, names, constants);
            return this;
        }
        get names() {
            const names = super.names;
            addExprNames(names, this.condition);
            if (this.else) addNames(names, this.else.names);
            return names;
        }
    }
    If.kind = "if";
    class For extends BlockNode {
    }
    For.kind = "for";
    class ForLoop extends For {
        constructor(iteration1){
            super();
            this.iteration = iteration1;
        }
        render(opts) {
            return `for(${this.iteration})` + super.render(opts);
        }
        optimizeNames(names, constants) {
            if (!super.optimizeNames(names, constants)) return;
            this.iteration = optimizeExpr(this.iteration, names, constants);
            return this;
        }
        get names() {
            return addNames(super.names, this.iteration.names);
        }
    }
    class ForRange extends For {
        constructor(varKind1, name1, from1, to1){
            super();
            this.varKind = varKind1;
            this.name = name1;
            this.from = from1;
            this.to = to1;
        }
        render(opts) {
            const varKind2 = opts.es5 ? scope.varKinds.var : this.varKind;
            const { name: name2 , from: from1 , to: to1  } = this;
            return `for(${varKind2} ${name2}=${from1}; ${name2}<${to1}; ${name2}++)` + super.render(opts);
        }
        get names() {
            const names = addExprNames(super.names, this.from);
            return addExprNames(names, this.to);
        }
    }
    class ForIter extends For {
        constructor(loop, varKind2, name2, iterable1){
            super();
            this.loop = loop;
            this.varKind = varKind2;
            this.name = name2;
            this.iterable = iterable1;
        }
        render(opts) {
            return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
        }
        optimizeNames(names, constants) {
            if (!super.optimizeNames(names, constants)) return;
            this.iterable = optimizeExpr(this.iterable, names, constants);
            return this;
        }
        get names() {
            return addNames(super.names, this.iterable.names);
        }
    }
    class Func extends BlockNode {
        constructor(name3, args1, async1){
            super();
            this.name = name3;
            this.args = args1;
            this.async = async1;
        }
        render(opts) {
            const _async = this.async ? "async " : "";
            return `${_async}function ${this.name}(${this.args})` + super.render(opts);
        }
    }
    Func.kind = "func";
    class Return extends ParentNode {
        render(opts) {
            return "return " + super.render(opts);
        }
    }
    Return.kind = "return";
    class Try extends BlockNode {
        render(opts) {
            let code21 = "try" + super.render(opts);
            if (this.catch) code21 += this.catch.render(opts);
            if (this.finally) code21 += this.finally.render(opts);
            return code21;
        }
        optimizeNodes() {
            var _a, _b;
            super.optimizeNodes();
            (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
            (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
            return this;
        }
        optimizeNames(names, constants) {
            var _a, _b;
            super.optimizeNames(names, constants);
            (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
            (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
            return this;
        }
        get names() {
            const names = super.names;
            if (this.catch) addNames(names, this.catch.names);
            if (this.finally) addNames(names, this.finally.names);
            return names;
        }
    }
    class Catch extends BlockNode {
        constructor(error1){
            super();
            this.error = error1;
        }
        render(opts) {
            return `catch(${this.error})` + super.render(opts);
        }
    }
    Catch.kind = "catch";
    class Finally extends BlockNode {
        render(opts) {
            return "finally" + super.render(opts);
        }
    }
    Finally.kind = "finally";
    class CodeGen2 {
        constructor(extScope, opts = {
        }){
            this._values = {
            };
            this._blockStarts = [];
            this._constants = {
            };
            this.opts = {
                ...opts,
                _n: opts.lines ? "\n" : ""
            };
            this._extScope = extScope;
            this._scope = new scope.Scope({
                parent: extScope
            });
            this._nodes = [
                new Root()
            ];
        }
        toString() {
            return this._root.render(this.opts);
        }
        name(prefix) {
            return this._scope.name(prefix);
        }
        scopeName(prefix) {
            return this._extScope.name(prefix);
        }
        scopeValue(prefixOrName, value) {
            const name4 = this._extScope.value(prefixOrName, value);
            const vs = this._values[name4.prefix] || (this._values[name4.prefix] = new Set());
            vs.add(name4);
            return name4;
        }
        getScopeValue(prefix, keyOrRef) {
            return this._extScope.getValue(prefix, keyOrRef);
        }
        scopeRefs(scopeName) {
            return this._extScope.scopeRefs(scopeName, this._values);
        }
        scopeCode() {
            return this._extScope.scopeCode(this._values);
        }
        _def(varKind, nameOrPrefix, rhs, constant) {
            const name4 = this._scope.toName(nameOrPrefix);
            if (rhs !== void 0 && constant) this._constants[name4.str] = rhs;
            this._leafNode(new Def(varKind, name4, rhs));
            return name4;
        }
        const(nameOrPrefix, rhs, _constant) {
            return this._def(scope.varKinds.const, nameOrPrefix, rhs, _constant);
        }
        let(nameOrPrefix, rhs, _constant) {
            return this._def(scope.varKinds.let, nameOrPrefix, rhs, _constant);
        }
        var(nameOrPrefix, rhs, _constant) {
            return this._def(scope.varKinds.var, nameOrPrefix, rhs, _constant);
        }
        assign(lhs, rhs, sideEffects) {
            return this._leafNode(new Assign(lhs, rhs, sideEffects));
        }
        add(lhs, rhs) {
            return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
        }
        code(c) {
            if (typeof c == "function") c();
            else if (c !== code1.nil) this._leafNode(new AnyCode(c));
            return this;
        }
        object(...keyValues) {
            const code$12 = [
                "{"
            ];
            for (const [key, value] of keyValues){
                if (code$12.length > 1) code$12.push(",");
                code$12.push(key);
                if (key !== value || this.opts.es5) {
                    code$12.push(":");
                    code1.addCodeArg(code$12, value);
                }
            }
            code$12.push("}");
            return new code1._Code(code$12);
        }
        if(condition, thenBody, elseBody) {
            this._blockNode(new If(condition));
            if (thenBody && elseBody) {
                this.code(thenBody).else().code(elseBody).endIf();
            } else if (thenBody) {
                this.code(thenBody).endIf();
            } else if (elseBody) {
                throw new Error('CodeGen: "else" body without "then" body');
            }
            return this;
        }
        elseIf(condition) {
            return this._elseNode(new If(condition));
        }
        else() {
            return this._elseNode(new Else());
        }
        endIf() {
            return this._endBlockNode(If, Else);
        }
        _for(node, forBody) {
            this._blockNode(node);
            if (forBody) this.code(forBody).endFor();
            return this;
        }
        for(iteration, forBody) {
            return this._for(new ForLoop(iteration), forBody);
        }
        forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope.varKinds.var : scope.varKinds.let) {
            const name4 = this._scope.toName(nameOrPrefix);
            return this._for(new ForRange(varKind, name4, from, to), ()=>forBody(name4)
            );
        }
        forOf(nameOrPrefix, iterable, forBody, varKind = scope.varKinds.const) {
            const name4 = this._scope.toName(nameOrPrefix);
            if (this.opts.es5) {
                const arr = iterable instanceof code1.Name ? iterable : this.var("_arr", iterable);
                return this.forRange("_i", 0, code1._`${arr}.length`, (i)=>{
                    this.var(name4, code1._`${arr}[${i}]`);
                    forBody(name4);
                });
            }
            return this._for(new ForIter("of", varKind, name4, iterable), ()=>forBody(name4)
            );
        }
        forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope.varKinds.var : scope.varKinds.const) {
            if (this.opts.ownProperties) {
                return this.forOf(nameOrPrefix, code1._`Object.keys(${obj})`, forBody);
            }
            const name4 = this._scope.toName(nameOrPrefix);
            return this._for(new ForIter("in", varKind, name4, obj), ()=>forBody(name4)
            );
        }
        endFor() {
            return this._endBlockNode(For);
        }
        label(label) {
            return this._leafNode(new Label(label));
        }
        break(label) {
            return this._leafNode(new Break(label));
        }
        return(value) {
            const node = new Return();
            this._blockNode(node);
            this.code(value);
            if (node.nodes.length !== 1) throw new Error('CodeGen: "return" should have one node');
            return this._endBlockNode(Return);
        }
        try(tryBody, catchCode, finallyCode) {
            if (!catchCode && !finallyCode) throw new Error('CodeGen: "try" without "catch" and "finally"');
            const node = new Try();
            this._blockNode(node);
            this.code(tryBody);
            if (catchCode) {
                const error2 = this.name("e");
                this._currNode = node.catch = new Catch(error2);
                catchCode(error2);
            }
            if (finallyCode) {
                this._currNode = node.finally = new Finally();
                this.code(finallyCode);
            }
            return this._endBlockNode(Catch, Finally);
        }
        throw(error) {
            return this._leafNode(new Throw(error));
        }
        block(body, nodeCount) {
            this._blockStarts.push(this._nodes.length);
            if (body) this.code(body).endBlock(nodeCount);
            return this;
        }
        endBlock(nodeCount) {
            const len = this._blockStarts.pop();
            if (len === void 0) throw new Error("CodeGen: not in self-balancing block");
            const toClose = this._nodes.length - len;
            if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
                throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
            }
            this._nodes.length = len;
            return this;
        }
        func(name, args = code1.nil, async, funcBody) {
            this._blockNode(new Func(name, args, async));
            if (funcBody) this.code(funcBody).endFunc();
            return this;
        }
        endFunc() {
            return this._endBlockNode(Func);
        }
        optimize(n = 1) {
            while((n--) > 0){
                this._root.optimizeNodes();
                this._root.optimizeNames(this._root.names, this._constants);
            }
        }
        _leafNode(node) {
            this._currNode.nodes.push(node);
            return this;
        }
        _blockNode(node) {
            this._currNode.nodes.push(node);
            this._nodes.push(node);
        }
        _endBlockNode(N1, N2) {
            const n = this._currNode;
            if (n instanceof N1 || N2 && n instanceof N2) {
                this._nodes.pop();
                return this;
            }
            throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
        }
        _elseNode(node) {
            const n = this._currNode;
            if (!(n instanceof If)) {
                throw new Error('CodeGen: "else" without "if"');
            }
            this._currNode = n.else = node;
            return this;
        }
        get _root() {
            return this._nodes[0];
        }
        get _currNode() {
            const ns = this._nodes;
            return ns[ns.length - 1];
        }
        set _currNode(node) {
            const ns = this._nodes;
            ns[ns.length - 1] = node;
        }
    }
    exports.CodeGen = CodeGen2;
    function addNames(names, from2) {
        for(const n in from2)names[n] = (names[n] || 0) + (from2[n] || 0);
        return names;
    }
    function addExprNames(names, from2) {
        return from2 instanceof code1._CodeOrName ? addNames(names, from2.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
        if (expr instanceof code1.Name) return replaceName(expr);
        if (!canOptimize(expr)) return expr;
        return new code1._Code(expr._items.reduce((items2, c)=>{
            if (c instanceof code1.Name) c = replaceName(c);
            if (c instanceof code1._Code) items2.push(...c._items);
            else items2.push(c);
            return items2;
        }, []));
        function replaceName(n) {
            const c = constants[n.str];
            if (c === void 0 || names[n.str] !== 1) return n;
            delete names[n.str];
            return c;
        }
        function canOptimize(e) {
            return e instanceof code1._Code && e._items.some((c)=>c instanceof code1.Name && names[c.str] === 1 && constants[c.str] !== void 0
            );
        }
    }
    function subtractNames(names, from2) {
        for(const n in from2)names[n] = (names[n] || 0) - (from2[n] || 0);
    }
    function not2(x) {
        return typeof x == "boolean" || typeof x == "number" || x === null ? !x : code1._`!${par(x)}`;
    }
    exports.not = not2;
    const andCode = mappend(exports.operators.AND);
    function and(...args2) {
        return args2.reduce(andCode);
    }
    exports.and = and;
    const orCode = mappend(exports.operators.OR);
    function or(...args2) {
        return args2.reduce(orCode);
    }
    exports.or = or;
    function mappend(op1) {
        return (x, y)=>x === code1.nil ? y : y === code1.nil ? x : code1._`${par(x)} ${op1} ${par(y)}`
        ;
    }
    function par(x) {
        return x instanceof code1.Name ? x : code1._`(${x})`;
    }
});
var util = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    function toHash(arr) {
        const hash = {
        };
        for (const item of arr)hash[item] = true;
        return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
        if (typeof schema == "boolean") return schema;
        if (Object.keys(schema).length === 0) return true;
        checkUnknownRules(it, schema);
        return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
        const { opts , self  } = it;
        if (!opts.strictSchema) return;
        if (typeof schema === "boolean") return;
        const rules2 = self.RULES.keywords;
        for(const key in schema){
            if (!rules2[key]) checkStrictMode(it, `unknown keyword: "${key}"`);
        }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules2) {
        if (typeof schema == "boolean") return !schema;
        for(const key in schema)if (rules2[key]) return true;
        return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
        if (typeof schema == "boolean") return !schema;
        for(const key in schema)if (key !== "$ref" && RULES.all[key]) return true;
        return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef , schemaPath  }, schema, keyword2, $data) {
        if (!$data) {
            if (typeof schema == "number" || typeof schema == "boolean") return schema;
            if (typeof schema == "string") return codegen._`${schema}`;
        }
        return codegen._`${topSchemaRef}${schemaPath}${codegen.getProperty(keyword2)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str2) {
        return unescapeJsonPointer(decodeURIComponent(str2));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str2) {
        return encodeURIComponent(escapeJsonPointer(str2));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str2) {
        if (typeof str2 == "number") return `${str2}`;
        return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str2) {
        return str2.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
        if (Array.isArray(xs)) {
            for (const x of xs)f(x);
        } else {
            f(xs);
        }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames , mergeToName , mergeValues , resultToName  }) {
        return (gen, from, to, toName)=>{
            const res = to === void 0 ? from : to instanceof codegen.Name ? (from instanceof codegen.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
            return toName === codegen.Name && !(res instanceof codegen.Name) ? resultToName(gen, res) : res;
        };
    }
    exports.mergeEvaluated = {
        props: makeMergeEvaluated({
            mergeNames: (gen, from, to)=>gen.if(codegen._`${to} !== true && ${from} !== undefined`, ()=>{
                    gen.if(codegen._`${from} === true`, ()=>gen.assign(to, true)
                    , ()=>gen.assign(to, codegen._`${to} || {}`).code(codegen._`Object.assign(${to}, ${from})`)
                    );
                })
            ,
            mergeToName: (gen, from, to)=>gen.if(codegen._`${to} !== true`, ()=>{
                    if (from === true) {
                        gen.assign(to, true);
                    } else {
                        gen.assign(to, codegen._`${to} || {}`);
                        setEvaluated(gen, to, from);
                    }
                })
            ,
            mergeValues: (from, to)=>from === true ? true : {
                    ...from,
                    ...to
                }
            ,
            resultToName: evaluatedPropsToName
        }),
        items: makeMergeEvaluated({
            mergeNames: (gen, from, to)=>gen.if(codegen._`${to} !== true && ${from} !== undefined`, ()=>gen.assign(to, codegen._`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)
                )
            ,
            mergeToName: (gen, from, to)=>gen.if(codegen._`${to} !== true`, ()=>gen.assign(to, from === true ? true : codegen._`${to} > ${from} ? ${to} : ${from}`)
                )
            ,
            mergeValues: (from, to)=>from === true ? true : Math.max(from, to)
            ,
            resultToName: (gen, items2)=>gen.var("items", items2)
        })
    };
    function evaluatedPropsToName(gen, ps) {
        if (ps === true) return gen.var("props", true);
        const props = gen.var("props", codegen._`{}`);
        if (ps !== void 0) setEvaluated(gen, props, ps);
        return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
        Object.keys(ps).forEach((p)=>gen.assign(codegen._`${props}${codegen.getProperty(p)}`, true)
        );
    }
    exports.setEvaluated = setEvaluated;
    const snippets = {
    };
    function useFunc(gen, f) {
        return gen.scopeValue("func", {
            ref: f,
            code: snippets[f.code] || (snippets[f.code] = new code1._Code(f.code))
        });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
        Type2[Type2["Num"] = 0] = "Num";
        Type2[Type2["Str"] = 1] = "Str";
    })(Type = exports.Type || (exports.Type = {
    }));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
        if (dataProp instanceof codegen.Name) {
            const isNumber1 = dataPropType === Type.Num;
            return jsPropertySyntax ? isNumber1 ? codegen._`"[" + ${dataProp} + "]"` : codegen._`"['" + ${dataProp} + "']"` : isNumber1 ? codegen._`"/" + ${dataProp}` : codegen._`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
        }
        return jsPropertySyntax ? codegen.getProperty(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
        if (!mode) return;
        msg = `strict mode: ${msg}`;
        if (mode === true) throw new Error(msg);
        it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
});
var names_1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const names = {
        data: new codegen.Name("data"),
        valCxt: new codegen.Name("valCxt"),
        instancePath: new codegen.Name("instancePath"),
        parentData: new codegen.Name("parentData"),
        parentDataProperty: new codegen.Name("parentDataProperty"),
        rootData: new codegen.Name("rootData"),
        dynamicAnchors: new codegen.Name("dynamicAnchors"),
        vErrors: new codegen.Name("vErrors"),
        errors: new codegen.Name("errors"),
        this: new codegen.Name("this"),
        self: new codegen.Name("self"),
        scope: new codegen.Name("scope"),
        json: new codegen.Name("json"),
        jsonPos: new codegen.Name("jsonPos"),
        jsonLen: new codegen.Name("jsonLen"),
        jsonPart: new codegen.Name("jsonPart")
    };
    exports.default = names;
});
var errors = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    exports.keywordError = {
        message: ({ keyword: keyword2  })=>codegen.str`should pass "${keyword2}" keyword validation`
    };
    exports.keyword$DataError = {
        message: ({ keyword: keyword2 , schemaType  })=>schemaType ? codegen.str`"${keyword2}" keyword must be ${schemaType} ($data)` : codegen.str`"${keyword2}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
        const { it  } = cxt;
        const { gen , compositeRule , allErrors  } = it;
        const errObj = errorObjectCode(cxt, error, errorPaths);
        if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
            addError(gen, errObj);
        } else {
            returnErrors(it, codegen._`[${errObj}]`);
        }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
        const { it  } = cxt;
        const { gen , compositeRule , allErrors  } = it;
        const errObj = errorObjectCode(cxt, error, errorPaths);
        addError(gen, errObj);
        if (!(compositeRule || allErrors)) {
            returnErrors(it, names_1.default.vErrors);
        }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
        gen.assign(names_1.default.errors, errsCount);
        gen.if(codegen._`${names_1.default.vErrors} !== null`, ()=>gen.if(errsCount, ()=>gen.assign(codegen._`${names_1.default.vErrors}.length`, errsCount)
            , ()=>gen.assign(names_1.default.vErrors, null)
            )
        );
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen , keyword: keyword2 , schemaValue , data , errsCount , it  }) {
        if (errsCount === void 0) throw new Error("ajv implementation error");
        const err = gen.name("err");
        gen.forRange("i", errsCount, names_1.default.errors, (i)=>{
            gen.const(err, codegen._`${names_1.default.vErrors}[${i}]`);
            gen.if(codegen._`${err}.instancePath === undefined`, ()=>gen.assign(codegen._`${err}.instancePath`, codegen.strConcat(names_1.default.instancePath, it.errorPath))
            );
            gen.assign(codegen._`${err}.schemaPath`, codegen.str`${it.errSchemaPath}/${keyword2}`);
            if (it.opts.verbose) {
                gen.assign(codegen._`${err}.schema`, schemaValue);
                gen.assign(codegen._`${err}.data`, data);
            }
        });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
        const err = gen.const("err", errObj);
        gen.if(codegen._`${names_1.default.vErrors} === null`, ()=>gen.assign(names_1.default.vErrors, codegen._`[${err}]`)
        , codegen._`${names_1.default.vErrors}.push(${err})`);
        gen.code(codegen._`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
        const { gen , validateName , schemaEnv  } = it;
        if (schemaEnv.$async) {
            gen.throw(codegen._`new ${it.ValidationError}(${errs})`);
        } else {
            gen.assign(codegen._`${validateName}.errors`, errs);
            gen.return(false);
        }
    }
    const E = {
        keyword: new codegen.Name("keyword"),
        schemaPath: new codegen.Name("schemaPath"),
        params: new codegen.Name("params"),
        propertyName: new codegen.Name("propertyName"),
        message: new codegen.Name("message"),
        schema: new codegen.Name("schema"),
        parentSchema: new codegen.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
        const { createErrors  } = cxt.it;
        if (createErrors === false) return codegen._`{}`;
        return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {
    }) {
        const { gen , it  } = cxt;
        const keyValues = [
            errorInstancePath(it, errorPaths),
            errorSchemaPath(cxt, errorPaths)
        ];
        extraErrorProps(cxt, error, keyValues);
        return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath  }, { instancePath  }) {
        const instPath = instancePath ? codegen.str`${errorPath}${util.getErrorPath(instancePath, util.Type.Str)}` : errorPath;
        return [
            names_1.default.instancePath,
            codegen.strConcat(names_1.default.instancePath, instPath)
        ];
    }
    function errorSchemaPath({ keyword: keyword2 , it: { errSchemaPath  }  }, { schemaPath , parentSchema  }) {
        let schPath = parentSchema ? errSchemaPath : codegen.str`${errSchemaPath}/${keyword2}`;
        if (schemaPath) {
            schPath = codegen.str`${schPath}${util.getErrorPath(schemaPath, util.Type.Str)}`;
        }
        return [
            E.schemaPath,
            schPath
        ];
    }
    function extraErrorProps(cxt, { params , message: message1  }, keyValues) {
        const { keyword: keyword2 , data , schemaValue , it  } = cxt;
        const { opts , propertyName , topSchemaRef , schemaPath  } = it;
        keyValues.push([
            E.keyword,
            keyword2
        ], [
            E.params,
            typeof params == "function" ? params(cxt) : params || codegen._`{}`
        ]);
        if (opts.messages) {
            keyValues.push([
                E.message,
                typeof message1 == "function" ? message1(cxt) : message1
            ]);
        }
        if (opts.verbose) {
            keyValues.push([
                E.schema,
                schemaValue
            ], [
                E.parentSchema,
                codegen._`${topSchemaRef}${schemaPath}`
            ], [
                names_1.default.data,
                data
            ]);
        }
        if (propertyName) keyValues.push([
            E.propertyName,
            propertyName
        ]);
    }
});
var boolSchema = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    const boolError = {
        message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
        const { gen , schema , validateName  } = it;
        if (schema === false) {
            falseSchemaError(it, false);
        } else if (typeof schema == "object" && schema.$async === true) {
            gen.return(names_1.default.data);
        } else {
            gen.assign(codegen._`${validateName}.errors`, null);
            gen.return(true);
        }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
        const { gen , schema  } = it;
        if (schema === false) {
            gen.var(valid, false);
            falseSchemaError(it);
        } else {
            gen.var(valid, true);
        }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
        const { gen , data  } = it;
        const cxt = {
            gen,
            keyword: "false schema",
            data,
            schema: false,
            schemaCode: false,
            schemaValue: false,
            params: {
            },
            it
        };
        errors.reportError(cxt, boolError, void 0, overrideAllErrors);
    }
});
var rules = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.getRules = exports.isJSONType = void 0;
    const _jsonTypes = [
        "string",
        "number",
        "integer",
        "boolean",
        "null",
        "object",
        "array"
    ];
    const jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
        return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
        const groups = {
            number: {
                type: "number",
                rules: []
            },
            string: {
                type: "string",
                rules: []
            },
            array: {
                type: "array",
                rules: []
            },
            object: {
                type: "object",
                rules: []
            }
        };
        return {
            types: {
                ...groups,
                integer: true,
                boolean: true,
                null: true
            },
            rules: [
                {
                    rules: []
                },
                groups.number,
                groups.string,
                groups.array,
                groups.object
            ],
            post: {
                rules: []
            },
            all: {
            },
            keywords: {
            }
        };
    }
    exports.getRules = getRules;
});
var applicability = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema , self  }, type2) {
        const group = self.RULES.types[type2];
        return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
        return group.rules.some((rule)=>shouldUseRule(schema, rule)
        );
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
        var _a;
        return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd)=>schema[kwd] !== void 0
        ));
    }
    exports.shouldUseRule = shouldUseRule;
});
var dataType = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var DataType;
    (function(DataType2) {
        DataType2[DataType2["Correct"] = 0] = "Correct";
        DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType = exports.DataType || (exports.DataType = {
    }));
    function getSchemaTypes(schema) {
        const types2 = getJSONTypes(schema.type);
        const hasNull = types2.includes("null");
        if (hasNull) {
            if (schema.nullable === false) throw new Error("type: null contradicts nullable: false");
        } else {
            if (!types2.length && schema.nullable !== void 0) {
                throw new Error('"nullable" cannot be used without "type"');
            }
            if (schema.nullable === true) types2.push("null");
        }
        return types2;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
        const types2 = Array.isArray(ts) ? ts : ts ? [
            ts
        ] : [];
        if (types2.every(rules.isJSONType)) return types2;
        throw new Error("type must be JSONType or JSONType[]: " + types2.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types2) {
        const { gen , data , opts  } = it;
        const coerceTo = coerceToTypes(types2, opts.coerceTypes);
        const checkTypes = types2.length > 0 && !(coerceTo.length === 0 && types2.length === 1 && applicability.schemaHasRulesForType(it, types2[0]));
        if (checkTypes) {
            const wrongType = checkDataTypes(types2, data, opts.strictNumbers, DataType.Wrong);
            gen.if(wrongType, ()=>{
                if (coerceTo.length) coerceData(it, types2, coerceTo);
                else reportTypeError(it);
            });
        }
        return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    const COERCIBLE = new Set([
        "string",
        "number",
        "integer",
        "boolean",
        "null"
    ]);
    function coerceToTypes(types2, coerceTypes) {
        return coerceTypes ? types2.filter((t)=>COERCIBLE.has(t) || coerceTypes === "array" && t === "array"
        ) : [];
    }
    function coerceData(it, types2, coerceTo) {
        const { gen , data , opts  } = it;
        const dataType2 = gen.let("dataType", codegen._`typeof ${data}`);
        const coerced = gen.let("coerced", codegen._`undefined`);
        if (opts.coerceTypes === "array") {
            gen.if(codegen._`${dataType2} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, ()=>gen.assign(data, codegen._`${data}[0]`).assign(dataType2, codegen._`typeof ${data}`).if(checkDataTypes(types2, data, opts.strictNumbers), ()=>gen.assign(coerced, data)
                )
            );
        }
        gen.if(codegen._`${coerced} !== undefined`);
        for (const t of coerceTo){
            if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
                coerceSpecificType(t);
            }
        }
        gen.else();
        reportTypeError(it);
        gen.endIf();
        gen.if(codegen._`${coerced} !== undefined`, ()=>{
            gen.assign(data, coerced);
            assignParentData(it, coerced);
        });
        function coerceSpecificType(t1) {
            switch(t1){
                case "string":
                    gen.elseIf(codegen._`${dataType2} == "number" || ${dataType2} == "boolean"`).assign(coerced, codegen._`"" + ${data}`).elseIf(codegen._`${data} === null`).assign(coerced, codegen._`""`);
                    return;
                case "number":
                    gen.elseIf(codegen._`${dataType2} == "boolean" || ${data} === null\n              || (${dataType2} == "string" && ${data} && ${data} == +${data})`).assign(coerced, codegen._`+${data}`);
                    return;
                case "integer":
                    gen.elseIf(codegen._`${dataType2} === "boolean" || ${data} === null\n              || (${dataType2} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, codegen._`+${data}`);
                    return;
                case "boolean":
                    gen.elseIf(codegen._`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf(codegen._`${data} === "true" || ${data} === 1`).assign(coerced, true);
                    return;
                case "null":
                    gen.elseIf(codegen._`${data} === "" || ${data} === 0 || ${data} === false`);
                    gen.assign(coerced, null);
                    return;
                case "array":
                    gen.elseIf(codegen._`${dataType2} === "string" || ${dataType2} === "number"\n              || ${dataType2} === "boolean" || ${data} === null`).assign(coerced, codegen._`[${data}]`);
            }
        }
    }
    function assignParentData({ gen , parentData , parentDataProperty  }, expr) {
        gen.if(codegen._`${parentData} !== undefined`, ()=>gen.assign(codegen._`${parentData}[${parentDataProperty}]`, expr)
        );
    }
    function checkDataType(dataType2, data, strictNums, correct = DataType.Correct) {
        const EQ = correct === DataType.Correct ? codegen.operators.EQ : codegen.operators.NEQ;
        let cond;
        switch(dataType2){
            case "null":
                return codegen._`${data} ${EQ} null`;
            case "array":
                cond = codegen._`Array.isArray(${data})`;
                break;
            case "object":
                cond = codegen._`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
                break;
            case "integer":
                cond = numCond(codegen._`!(${data} % 1) && !isNaN(${data})`);
                break;
            case "number":
                cond = numCond();
                break;
            default:
                return codegen._`typeof ${data} ${EQ} ${dataType2}`;
        }
        return correct === DataType.Correct ? cond : codegen.not(cond);
        function numCond(_cond = codegen.nil) {
            return codegen.and(codegen._`typeof ${data} == "number"`, _cond, strictNums ? codegen._`isFinite(${data})` : codegen.nil);
        }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
        if (dataTypes.length === 1) {
            return checkDataType(dataTypes[0], data, strictNums, correct);
        }
        let cond;
        const types2 = util.toHash(dataTypes);
        if (types2.array && types2.object) {
            const notObj = codegen._`typeof ${data} != "object"`;
            cond = types2.null ? notObj : codegen._`!${data} || ${notObj}`;
            delete types2.null;
            delete types2.array;
            delete types2.object;
        } else {
            cond = codegen.nil;
        }
        if (types2.number) delete types2.integer;
        for(const t in types2)cond = codegen.and(cond, checkDataType(t, data, strictNums, correct));
        return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    const typeError = {
        message: ({ schema  })=>`must be ${schema}`
        ,
        params: ({ schema , schemaValue  })=>typeof schema == "string" ? codegen._`{type: ${schema}}` : codegen._`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
        const cxt = getTypeErrorContext(it);
        errors.reportError(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
        const { gen , data , schema  } = it;
        const schemaCode = util.schemaRefOrVal(it, schema, "type");
        return {
            gen,
            keyword: "type",
            data,
            schema: schema.type,
            schemaCode,
            schemaValue: schemaCode,
            parentSchema: schema,
            params: {
            },
            it
        };
    }
});
var defaults = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.assignDefaults = void 0;
    function assignDefaults(it, ty) {
        const { properties: properties2 , items: items2  } = it.schema;
        if (ty === "object" && properties2) {
            for(const key in properties2){
                assignDefault(it, key, properties2[key].default);
            }
        } else if (ty === "array" && Array.isArray(items2)) {
            items2.forEach((sch, i)=>assignDefault(it, i, sch.default)
            );
        }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
        const { gen , compositeRule , data , opts  } = it;
        if (defaultValue === void 0) return;
        const childData = codegen._`${data}${codegen.getProperty(prop)}`;
        if (compositeRule) {
            util.checkStrictMode(it, `default is ignored for: ${childData}`);
            return;
        }
        let condition = codegen._`${childData} === undefined`;
        if (opts.useDefaults === "empty") {
            condition = codegen._`${condition} || ${childData} === null || ${childData} === ""`;
        }
        gen.if(condition, codegen._`${childData} = ${codegen.stringify(defaultValue)}`);
    }
});
var code$1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    function checkReportMissingProp(cxt, prop) {
        const { gen , data , it  } = cxt;
        gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), ()=>{
            cxt.setParams({
                missingProperty: codegen._`${prop}`
            }, true);
            cxt.error();
        });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen , data , it: { opts  }  }, properties2, missing) {
        return codegen.or(...properties2.map((prop)=>codegen.and(noPropertyInData(gen, data, prop, opts.ownProperties), codegen._`${missing} = ${prop}`)
        ));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
        cxt.setParams({
            missingProperty: missing
        }, true);
        cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
        return gen.scopeValue("func", {
            ref: Object.prototype.hasOwnProperty,
            code: codegen._`Object.prototype.hasOwnProperty`
        });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
        return codegen._`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
        const cond = codegen._`${data}${codegen.getProperty(property)} !== undefined`;
        return ownProperties ? codegen._`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
        const cond = codegen._`${data}${codegen.getProperty(property)} === undefined`;
        return ownProperties ? codegen.or(cond, codegen.not(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
        return schemaMap ? Object.keys(schemaMap).filter((p)=>p !== "__proto__"
        ) : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
        return allSchemaProperties(schemaMap).filter((p)=>!util.alwaysValidSchema(it, schemaMap[p])
        );
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode , data , it: { gen , topSchemaRef , schemaPath , errorPath  } , it  }, func, context, passSchema) {
        const dataAndSchema = passSchema ? codegen._`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
        const valCxt = [
            [
                names_1.default.instancePath,
                codegen.strConcat(names_1.default.instancePath, errorPath)
            ],
            [
                names_1.default.parentData,
                it.parentData
            ],
            [
                names_1.default.parentDataProperty,
                it.parentDataProperty
            ],
            [
                names_1.default.rootData,
                names_1.default.rootData
            ]
        ];
        if (it.opts.dynamicRef) valCxt.push([
            names_1.default.dynamicAnchors,
            names_1.default.dynamicAnchors
        ]);
        const args = codegen._`${dataAndSchema}, ${gen.object(...valCxt)}`;
        return context !== codegen.nil ? codegen._`${func}.call(${context}, ${args})` : codegen._`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    function usePattern({ gen , it: { opts  }  }, pattern2) {
        const u = opts.unicodeRegExp ? "u" : "";
        return gen.scopeValue("pattern", {
            key: pattern2,
            ref: new RegExp(pattern2, u),
            code: codegen._`new RegExp(${pattern2}, ${u})`
        });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
        const { gen , data , keyword: keyword2 , it  } = cxt;
        const valid = gen.name("valid");
        if (it.allErrors) {
            const validArr = gen.let("valid", true);
            validateItems(()=>gen.assign(validArr, false)
            );
            return validArr;
        }
        gen.var(valid, true);
        validateItems(()=>gen.break()
        );
        return valid;
        function validateItems(notValid) {
            const len = gen.const("len", codegen._`${data}.length`);
            gen.forRange("i", 0, len, (i)=>{
                cxt.subschema({
                    keyword: keyword2,
                    dataProp: i,
                    dataPropType: util.Type.Num
                }, valid);
                gen.if(codegen.not(valid), notValid);
            });
        }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
        const { gen , schema , keyword: keyword2 , it  } = cxt;
        if (!Array.isArray(schema)) throw new Error("ajv implementation error");
        const alwaysValid = schema.some((sch)=>util.alwaysValidSchema(it, sch)
        );
        if (alwaysValid && !it.opts.unevaluated) return;
        const valid = gen.let("valid", false);
        const schValid = gen.name("_valid");
        gen.block(()=>schema.forEach((_sch, i)=>{
                const schCxt = cxt.subschema({
                    keyword: keyword2,
                    schemaProp: i,
                    compositeRule: true
                }, schValid);
                gen.assign(valid, codegen._`${valid} || ${schValid}`);
                const merged = cxt.mergeValidEvaluated(schCxt, schValid);
                if (!merged) gen.if(codegen.not(valid));
            })
        );
        cxt.result(valid, ()=>cxt.reset()
        , ()=>cxt.error(true)
        );
    }
    exports.validateUnion = validateUnion;
});
var keyword = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    function macroKeywordCode(cxt, def) {
        const { gen , keyword: keyword2 , schema , parentSchema , it  } = cxt;
        const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
        const schemaRef = useKeyword(gen, keyword2, macroSchema);
        if (it.opts.validateSchema !== false) it.self.validateSchema(macroSchema, true);
        const valid = gen.name("valid");
        cxt.subschema({
            schema: macroSchema,
            schemaPath: codegen.nil,
            errSchemaPath: `${it.errSchemaPath}/${keyword2}`,
            topSchemaRef: schemaRef,
            compositeRule: true
        }, valid);
        cxt.pass(valid, ()=>cxt.error(true)
        );
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
        var _a;
        const { gen , keyword: keyword2 , schema , parentSchema , $data , it  } = cxt;
        checkAsyncKeyword(it, def);
        const validate2 = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
        const validateRef = useKeyword(gen, keyword2, validate2);
        const valid = gen.let("valid");
        cxt.block$data(valid, validateKeyword);
        cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
        function validateKeyword() {
            if (def.errors === false) {
                assignValid();
                if (def.modifying) modifyData(cxt);
                reportErrs(()=>cxt.error()
                );
            } else {
                const ruleErrs = def.async ? validateAsync() : validateSync();
                if (def.modifying) modifyData(cxt);
                reportErrs(()=>addErrs(cxt, ruleErrs)
                );
            }
        }
        function validateAsync() {
            const ruleErrs = gen.let("ruleErrs", null);
            gen.try(()=>assignValid(codegen._`await `)
            , (e)=>gen.assign(valid, false).if(codegen._`${e} instanceof ${it.ValidationError}`, ()=>gen.assign(ruleErrs, codegen._`${e}.errors`)
                , ()=>gen.throw(e)
                )
            );
            return ruleErrs;
        }
        function validateSync() {
            const validateErrs = codegen._`${validateRef}.errors`;
            gen.assign(validateErrs, null);
            assignValid(codegen.nil);
            return validateErrs;
        }
        function assignValid(_await = def.async ? codegen._`await ` : codegen.nil) {
            const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
            const passSchema = !("compile" in def && !$data || def.schema === false);
            gen.assign(valid, codegen._`${_await}${code$1.callValidateCode(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
        }
        function reportErrs(errors2) {
            var _a2;
            gen.if(codegen.not((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors2);
        }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
        const { gen , data , it  } = cxt;
        gen.if(it.parentData, ()=>gen.assign(data, codegen._`${it.parentData}[${it.parentDataProperty}]`)
        );
    }
    function addErrs(cxt, errs) {
        const { gen  } = cxt;
        gen.if(codegen._`Array.isArray(${errs})`, ()=>{
            gen.assign(names_1.default.vErrors, codegen._`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, codegen._`${names_1.default.vErrors}.length`);
            errors.extendErrors(cxt);
        }, ()=>cxt.error()
        );
    }
    function checkAsyncKeyword({ schemaEnv  }, def) {
        if (def.async && !schemaEnv.$async) throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword2, result) {
        if (result === void 0) throw new Error(`keyword "${keyword2}" failed to compile`);
        return gen.scopeValue("keyword", typeof result == "function" ? {
            ref: result
        } : {
            ref: result,
            code: codegen.stringify(result)
        });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
        return !schemaType.length || schemaType.some((st)=>st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined"
        );
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema , opts , self , errSchemaPath  }, def, keyword2) {
        if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword2) : def.keyword !== keyword2) {
            throw new Error("ajv implementation error");
        }
        const deps = def.dependencies;
        if (deps === null || deps === void 0 ? void 0 : deps.some((kwd)=>!Object.prototype.hasOwnProperty.call(schema, kwd)
        )) {
            throw new Error(`parent schema must have dependencies of ${keyword2}: ${deps.join(",")}`);
        }
        if (def.validateSchema) {
            const valid = def.validateSchema(schema[keyword2]);
            if (!valid) {
                const msg = `keyword "${keyword2}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
                if (opts.validateSchema === "log") self.logger.error(msg);
                else throw new Error(msg);
            }
        }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
});
var subschema = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    function getSubschema(it, { keyword: keyword2 , schemaProp , schema , schemaPath , errSchemaPath , topSchemaRef  }) {
        if (keyword2 !== void 0 && schema !== void 0) {
            throw new Error('both "keyword" and "schema" passed, only one allowed');
        }
        if (keyword2 !== void 0) {
            const sch = it.schema[keyword2];
            return schemaProp === void 0 ? {
                schema: sch,
                schemaPath: codegen._`${it.schemaPath}${codegen.getProperty(keyword2)}`,
                errSchemaPath: `${it.errSchemaPath}/${keyword2}`
            } : {
                schema: sch[schemaProp],
                schemaPath: codegen._`${it.schemaPath}${codegen.getProperty(keyword2)}${codegen.getProperty(schemaProp)}`,
                errSchemaPath: `${it.errSchemaPath}/${keyword2}/${util.escapeFragment(schemaProp)}`
            };
        }
        if (schema !== void 0) {
            if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
                throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
            }
            return {
                schema,
                schemaPath,
                topSchemaRef,
                errSchemaPath
            };
        }
        throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema2, it, { dataProp , dataPropType: dpType , data , dataTypes , propertyName  }) {
        if (data !== void 0 && dataProp !== void 0) {
            throw new Error('both "data" and "dataProp" passed, only one allowed');
        }
        const { gen  } = it;
        if (dataProp !== void 0) {
            const { errorPath , dataPathArr , opts  } = it;
            const nextData = gen.let("data", codegen._`${it.data}${codegen.getProperty(dataProp)}`, true);
            dataContextProps(nextData);
            subschema2.errorPath = codegen.str`${errorPath}${util.getErrorPath(dataProp, dpType, opts.jsPropertySyntax)}`;
            subschema2.parentDataProperty = codegen._`${dataProp}`;
            subschema2.dataPathArr = [
                ...dataPathArr,
                subschema2.parentDataProperty
            ];
        }
        if (data !== void 0) {
            const nextData = data instanceof codegen.Name ? data : gen.let("data", data, true);
            dataContextProps(nextData);
            if (propertyName !== void 0) subschema2.propertyName = propertyName;
        }
        if (dataTypes) subschema2.dataTypes = dataTypes;
        function dataContextProps(_nextData) {
            subschema2.data = _nextData;
            subschema2.dataLevel = it.dataLevel + 1;
            subschema2.dataTypes = [];
            it.definedProperties = new Set();
            subschema2.parentData = it.data;
            subschema2.dataNames = [
                ...it.dataNames,
                _nextData
            ];
        }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema2, { jtdDiscriminator , jtdMetadata , compositeRule , createErrors , allErrors  }) {
        if (compositeRule !== void 0) subschema2.compositeRule = compositeRule;
        if (createErrors !== void 0) subschema2.createErrors = createErrors;
        if (allErrors !== void 0) subschema2.allErrors = allErrors;
        subschema2.jtdDiscriminator = jtdDiscriminator;
        subschema2.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
});
var resolve = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    const SIMPLE_INLINED = new Set([
        "type",
        "format",
        "pattern",
        "maxLength",
        "minLength",
        "maxProperties",
        "minProperties",
        "maxItems",
        "minItems",
        "maximum",
        "minimum",
        "uniqueItems",
        "multipleOf",
        "required",
        "enum",
        "const"
    ]);
    function inlineRef(schema, limit = true) {
        if (typeof schema == "boolean") return true;
        if (limit === true) return !hasRef(schema);
        if (!limit) return false;
        return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    const REF_KEYWORDS = new Set([
        "$ref",
        "$recursiveRef",
        "$recursiveAnchor",
        "$dynamicRef",
        "$dynamicAnchor"
    ]);
    function hasRef(schema) {
        for(const key in schema){
            if (REF_KEYWORDS.has(key)) return true;
            const sch = schema[key];
            if (Array.isArray(sch) && sch.some(hasRef)) return true;
            if (typeof sch == "object" && hasRef(sch)) return true;
        }
        return false;
    }
    function countKeys(schema) {
        let count = 0;
        for(const key in schema){
            if (key === "$ref") return Infinity;
            count++;
            if (SIMPLE_INLINED.has(key)) continue;
            if (typeof schema[key] == "object") {
                util.eachItem(schema[key], (sch)=>count += countKeys(sch)
                );
            }
            if (count === Infinity) return Infinity;
        }
        return count;
    }
    function getFullPath(id2 = "", normalize) {
        if (normalize !== false) id2 = normalizeId(id2);
        const p = __pika_web_default_export_for_treeshaking__.parse(id2);
        return _getFullPath(p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(p) {
        return __pika_web_default_export_for_treeshaking__.serialize(p).split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    const TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id2) {
        return id2 ? id2.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(baseId, id2) {
        id2 = normalizeId(id2);
        return __pika_web_default_export_for_treeshaking__.resolve(baseId, id2);
    }
    exports.resolveUrl = resolveUrl;
    const ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema) {
        if (typeof schema == "boolean") return {
        };
        const schemaId = normalizeId(schema.$id);
        const baseIds = {
            "": schemaId
        };
        const pathPrefix = getFullPath(schemaId, false);
        const localRefs = {
        };
        const schemaRefs = new Set();
        jsonSchemaTraverse(schema, {
            allKeys: true
        }, (sch, jsonPtr, _2, parentJsonPtr)=>{
            if (parentJsonPtr === void 0) return;
            const fullPath = pathPrefix + jsonPtr;
            let baseId = baseIds[parentJsonPtr];
            if (typeof sch.$id == "string") baseId = addRef.call(this, sch.$id);
            addAnchor.call(this, sch.$anchor);
            addAnchor.call(this, sch.$dynamicAnchor);
            baseIds[jsonPtr] = baseId;
            function addRef(ref2) {
                ref2 = normalizeId(baseId ? __pika_web_default_export_for_treeshaking__.resolve(baseId, ref2) : ref2);
                if (schemaRefs.has(ref2)) throw ambiguos(ref2);
                schemaRefs.add(ref2);
                let schOrRef = this.refs[ref2];
                if (typeof schOrRef == "string") schOrRef = this.refs[schOrRef];
                if (typeof schOrRef == "object") {
                    checkAmbiguosRef(sch, schOrRef.schema, ref2);
                } else if (ref2 !== normalizeId(fullPath)) {
                    if (ref2[0] === "#") {
                        checkAmbiguosRef(sch, localRefs[ref2], ref2);
                        localRefs[ref2] = sch;
                    } else {
                        this.refs[ref2] = fullPath;
                    }
                }
                return ref2;
            }
            function addAnchor(anchor) {
                if (typeof anchor == "string") {
                    if (!ANCHOR.test(anchor)) throw new Error(`invalid anchor "${anchor}"`);
                    addRef.call(this, `#${anchor}`);
                }
            }
        });
        return localRefs;
        function checkAmbiguosRef(sch1, sch2, ref2) {
            if (sch2 !== void 0 && !fastDeepEqual(sch1, sch2)) throw ambiguos(ref2);
        }
        function ambiguos(ref2) {
            return new Error(`reference "${ref2}" resolves to more than one schema`);
        }
    }
    exports.getSchemaRefs = getSchemaRefs;
});
var validate = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    const dataType_2 = dataType;
    function validateFunctionCode(it) {
        if (isSchemaObj(it)) {
            checkKeywords(it);
            if (schemaCxtHasRules(it)) {
                topSchemaObjCode(it);
                return;
            }
        }
        validateFunction(it, ()=>boolSchema.topBoolOrEmptySchema(it)
        );
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen , validateName , schema , schemaEnv , opts  }, body) {
        if (opts.code.es5) {
            gen.func(validateName, codegen._`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, ()=>{
                gen.code(codegen._`"use strict"; ${funcSourceUrl(schema, opts)}`);
                destructureValCxtES5(gen, opts);
                gen.code(body);
            });
        } else {
            gen.func(validateName, codegen._`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, ()=>gen.code(funcSourceUrl(schema, opts)).code(body)
            );
        }
    }
    function destructureValCxt(opts) {
        return codegen._`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? codegen._`, ${names_1.default.dynamicAnchors}={}` : codegen.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
        gen.if(names_1.default.valCxt, ()=>{
            gen.var(names_1.default.instancePath, codegen._`${names_1.default.valCxt}.${names_1.default.instancePath}`);
            gen.var(names_1.default.parentData, codegen._`${names_1.default.valCxt}.${names_1.default.parentData}`);
            gen.var(names_1.default.parentDataProperty, codegen._`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
            gen.var(names_1.default.rootData, codegen._`${names_1.default.valCxt}.${names_1.default.rootData}`);
            if (opts.dynamicRef) gen.var(names_1.default.dynamicAnchors, codegen._`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
        }, ()=>{
            gen.var(names_1.default.instancePath, codegen._`""`);
            gen.var(names_1.default.parentData, codegen._`undefined`);
            gen.var(names_1.default.parentDataProperty, codegen._`undefined`);
            gen.var(names_1.default.rootData, names_1.default.data);
            if (opts.dynamicRef) gen.var(names_1.default.dynamicAnchors, codegen._`{}`);
        });
    }
    function topSchemaObjCode(it) {
        const { schema , opts , gen  } = it;
        validateFunction(it, ()=>{
            if (opts.$comment && schema.$comment) commentKeyword(it);
            checkNoDefault(it);
            gen.let(names_1.default.vErrors, null);
            gen.let(names_1.default.errors, 0);
            if (opts.unevaluated) resetEvaluated(it);
            typeAndKeywords(it);
            returnResults(it);
        });
        return;
    }
    function resetEvaluated(it) {
        const { gen , validateName  } = it;
        it.evaluated = gen.const("evaluated", codegen._`${validateName}.evaluated`);
        gen.if(codegen._`${it.evaluated}.dynamicProps`, ()=>gen.assign(codegen._`${it.evaluated}.props`, codegen._`undefined`)
        );
        gen.if(codegen._`${it.evaluated}.dynamicItems`, ()=>gen.assign(codegen._`${it.evaluated}.items`, codegen._`undefined`)
        );
    }
    function funcSourceUrl(schema, opts) {
        return typeof schema == "object" && schema.$id && (opts.code.source || opts.code.process) ? codegen._`/*# sourceURL=${schema.$id} */` : codegen.nil;
    }
    function subschemaCode(it, valid) {
        if (isSchemaObj(it)) {
            checkKeywords(it);
            if (schemaCxtHasRules(it)) {
                subSchemaObjCode(it, valid);
                return;
            }
        }
        boolSchema.boolOrEmptySchema(it, valid);
    }
    function schemaCxtHasRules({ schema , self  }) {
        if (typeof schema == "boolean") return !schema;
        for(const key in schema)if (self.RULES.all[key]) return true;
        return false;
    }
    function isSchemaObj(it) {
        return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
        const { schema , gen , opts  } = it;
        if (opts.$comment && schema.$comment) commentKeyword(it);
        updateContext(it);
        checkAsyncSchema(it);
        const errsCount = gen.const("_errs", names_1.default.errors);
        typeAndKeywords(it, errsCount);
        gen.var(valid, codegen._`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
        util.checkUnknownRules(it);
        checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
        if (it.opts.jtd) return schemaKeywords(it, [], false, errsCount);
        const types2 = dataType.getSchemaTypes(it.schema);
        const checkedTypes = dataType.coerceAndCheckDataType(it, types2);
        schemaKeywords(it, types2, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
        const { schema , errSchemaPath , opts , self  } = it;
        if (schema.$ref && opts.ignoreKeywordsWithRef && util.schemaHasRulesButRef(schema, self.RULES)) {
            self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
        }
    }
    function checkNoDefault(it) {
        const { schema , opts  } = it;
        if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
            util.checkStrictMode(it, "default is ignored in the schema root");
        }
    }
    function updateContext(it) {
        if (it.schema.$id) it.baseId = resolve.resolveUrl(it.baseId, it.schema.$id);
    }
    function checkAsyncSchema(it) {
        if (it.schema.$async && !it.schemaEnv.$async) throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen , schemaEnv , schema , errSchemaPath , opts  }) {
        const msg = schema.$comment;
        if (opts.$comment === true) {
            gen.code(codegen._`${names_1.default.self}.logger.log(${msg})`);
        } else if (typeof opts.$comment == "function") {
            const schemaPath = codegen.str`${errSchemaPath}/$comment`;
            const rootName = gen.scopeValue("root", {
                ref: schemaEnv.root
            });
            gen.code(codegen._`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
        }
    }
    function returnResults(it) {
        const { gen , schemaEnv , validateName , ValidationError , opts  } = it;
        if (schemaEnv.$async) {
            gen.if(codegen._`${names_1.default.errors} === 0`, ()=>gen.return(names_1.default.data)
            , ()=>gen.throw(codegen._`new ${ValidationError}(${names_1.default.vErrors})`)
            );
        } else {
            gen.assign(codegen._`${validateName}.errors`, names_1.default.vErrors);
            if (opts.unevaluated) assignEvaluated(it);
            gen.return(codegen._`${names_1.default.errors} === 0`);
        }
    }
    function assignEvaluated({ gen , evaluated , props , items: items2  }) {
        if (props instanceof codegen.Name) gen.assign(codegen._`${evaluated}.props`, props);
        if (items2 instanceof codegen.Name) gen.assign(codegen._`${evaluated}.items`, items2);
    }
    function schemaKeywords(it, types2, typeErrors, errsCount) {
        const { gen , schema , data , allErrors , opts , self  } = it;
        const { RULES  } = self;
        if (schema.$ref && (opts.ignoreKeywordsWithRef || !util.schemaHasRulesButRef(schema, RULES))) {
            gen.block(()=>keywordCode(it, "$ref", RULES.all.$ref.definition)
            );
            return;
        }
        if (!opts.jtd) checkStrictTypes(it, types2);
        gen.block(()=>{
            for (const group of RULES.rules)groupKeywords(group);
            groupKeywords(RULES.post);
        });
        function groupKeywords(group) {
            if (!applicability.shouldUseGroup(schema, group)) return;
            if (group.type) {
                gen.if(dataType_2.checkDataType(group.type, data, opts.strictNumbers));
                iterateKeywords(it, group);
                if (types2.length === 1 && types2[0] === group.type && typeErrors) {
                    gen.else();
                    dataType_2.reportTypeError(it);
                }
                gen.endIf();
            } else {
                iterateKeywords(it, group);
            }
            if (!allErrors) gen.if(codegen._`${names_1.default.errors} === ${errsCount || 0}`);
        }
    }
    function iterateKeywords(it, group) {
        const { gen , schema , opts: { useDefaults  }  } = it;
        if (useDefaults) defaults.assignDefaults(it, group.type);
        gen.block(()=>{
            for (const rule of group.rules){
                if (applicability.shouldUseRule(schema, rule)) {
                    keywordCode(it, rule.keyword, rule.definition, group.type);
                }
            }
        });
    }
    function checkStrictTypes(it, types2) {
        if (it.schemaEnv.meta || !it.opts.strictTypes) return;
        checkContextTypes(it, types2);
        if (!it.opts.allowUnionTypes) checkMultipleTypes(it, types2);
        checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types2) {
        if (!types2.length) return;
        if (!it.dataTypes.length) {
            it.dataTypes = types2;
            return;
        }
        types2.forEach((t)=>{
            if (!includesType(it.dataTypes, t)) {
                strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
            }
        });
        it.dataTypes = it.dataTypes.filter((t)=>includesType(types2, t)
        );
    }
    function checkMultipleTypes(it, ts) {
        if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
            strictTypesError(it, "use allowUnionTypes to allow union type keyword");
        }
    }
    function checkKeywordTypes(it, ts) {
        const rules2 = it.self.RULES.all;
        for(const keyword2 in rules2){
            const rule = rules2[keyword2];
            if (typeof rule == "object" && applicability.shouldUseRule(it.schema, rule)) {
                const { type: type2  } = rule.definition;
                if (type2.length && !type2.some((t)=>hasApplicableType(ts, t)
                )) {
                    strictTypesError(it, `missing type "${type2.join(",")}" for keyword "${keyword2}"`);
                }
            }
        }
    }
    function hasApplicableType(schTs, kwdT) {
        return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
        return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function strictTypesError(it, msg) {
        const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
        msg += ` at "${schemaPath}" (strictTypes)`;
        util.checkStrictMode(it, msg, it.opts.strictTypes);
    }
    class KeywordCxt2 {
        constructor(it, def, keyword$1){
            keyword.validateKeywordUsage(it, def, keyword$1);
            this.gen = it.gen;
            this.allErrors = it.allErrors;
            this.keyword = keyword$1;
            this.data = it.data;
            this.schema = it.schema[keyword$1];
            this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
            this.schemaValue = util.schemaRefOrVal(it, this.schema, keyword$1, this.$data);
            this.schemaType = def.schemaType;
            this.parentSchema = it.schema;
            this.params = {
            };
            this.it = it;
            this.def = def;
            if (this.$data) {
                this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
            } else {
                this.schemaCode = this.schemaValue;
                if (!keyword.validSchemaType(this.schema, def.schemaType, def.allowUndefined)) {
                    throw new Error(`${keyword$1} value must be ${JSON.stringify(def.schemaType)}`);
                }
            }
            if ("code" in def ? def.trackErrors : def.errors !== false) {
                this.errsCount = it.gen.const("_errs", names_1.default.errors);
            }
        }
        result(condition, successAction, failAction) {
            this.gen.if(codegen.not(condition));
            if (failAction) failAction();
            else this.error();
            if (successAction) {
                this.gen.else();
                successAction();
                if (this.allErrors) this.gen.endIf();
            } else {
                if (this.allErrors) this.gen.endIf();
                else this.gen.else();
            }
        }
        pass(condition, failAction) {
            this.result(condition, void 0, failAction);
        }
        fail(condition) {
            if (condition === void 0) {
                this.error();
                if (!this.allErrors) this.gen.if(false);
                return;
            }
            this.gen.if(condition);
            this.error();
            if (this.allErrors) this.gen.endIf();
            else this.gen.else();
        }
        fail$data(condition) {
            if (!this.$data) return this.fail(condition);
            const { schemaCode  } = this;
            this.fail(codegen._`${schemaCode} !== undefined && (${codegen.or(this.invalid$data(), condition)})`);
        }
        error(append, errorParams, errorPaths) {
            if (errorParams) {
                this.setParams(errorParams);
                this._error(append, errorPaths);
                this.setParams({
                });
                return;
            }
            this._error(append, errorPaths);
        }
        _error(append, errorPaths) {
            (append ? errors.reportExtraError : errors.reportError)(this, this.def.error, errorPaths);
        }
        $dataError() {
            errors.reportError(this, this.def.$dataError || errors.keyword$DataError);
        }
        reset() {
            if (this.errsCount === void 0) throw new Error('add "trackErrors" to keyword definition');
            errors.resetErrorsCount(this.gen, this.errsCount);
        }
        ok(cond) {
            if (!this.allErrors) this.gen.if(cond);
        }
        setParams(obj, assign) {
            if (assign) Object.assign(this.params, obj);
            else this.params = obj;
        }
        block$data(valid, codeBlock, $dataValid = codegen.nil) {
            this.gen.block(()=>{
                this.check$data(valid, $dataValid);
                codeBlock();
            });
        }
        check$data(valid = codegen.nil, $dataValid = codegen.nil) {
            if (!this.$data) return;
            const { gen , schemaCode , schemaType , def: def1  } = this;
            gen.if(codegen.or(codegen._`${schemaCode} === undefined`, $dataValid));
            if (valid !== codegen.nil) gen.assign(valid, true);
            if (schemaType.length || def1.validateSchema) {
                gen.elseIf(this.invalid$data());
                this.$dataError();
                if (valid !== codegen.nil) gen.assign(valid, false);
            }
            gen.else();
        }
        invalid$data() {
            const { gen , schemaCode , schemaType , def: def1 , it: it1  } = this;
            return codegen.or(wrong$DataType(), invalid$DataSchema());
            function wrong$DataType() {
                if (schemaType.length) {
                    if (!(schemaCode instanceof codegen.Name)) throw new Error("ajv implementation error");
                    const st = Array.isArray(schemaType) ? schemaType : [
                        schemaType
                    ];
                    return codegen._`${dataType_2.checkDataTypes(st, schemaCode, it1.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
                }
                return codegen.nil;
            }
            function invalid$DataSchema() {
                if (def1.validateSchema) {
                    const validateSchemaRef = gen.scopeValue("validate$data", {
                        ref: def1.validateSchema
                    });
                    return codegen._`!${validateSchemaRef}(${schemaCode})`;
                }
                return codegen.nil;
            }
        }
        subschema(appl, valid) {
            const subschema$1 = subschema.getSubschema(this.it, appl);
            subschema.extendSubschemaData(subschema$1, this.it, appl);
            subschema.extendSubschemaMode(subschema$1, appl);
            const nextContext = {
                ...this.it,
                ...subschema$1,
                items: void 0,
                props: void 0
            };
            subschemaCode(nextContext, valid);
            return nextContext;
        }
        mergeEvaluated(schemaCxt, toName) {
            const { it: it1 , gen  } = this;
            if (!it1.opts.unevaluated) return;
            if (it1.props !== true && schemaCxt.props !== void 0) {
                it1.props = util.mergeEvaluated.props(gen, schemaCxt.props, it1.props, toName);
            }
            if (it1.items !== true && schemaCxt.items !== void 0) {
                it1.items = util.mergeEvaluated.items(gen, schemaCxt.items, it1.items, toName);
            }
        }
        mergeValidEvaluated(schemaCxt, valid) {
            const { it: it1 , gen  } = this;
            if (it1.opts.unevaluated && (it1.props !== true || it1.items !== true)) {
                gen.if(valid, ()=>this.mergeEvaluated(schemaCxt, codegen.Name)
                );
                return true;
            }
        }
    }
    exports.KeywordCxt = KeywordCxt2;
    function keywordCode(it1, keyword$11, def1, ruleType) {
        const cxt = new KeywordCxt2(it1, def1, keyword$11);
        if ("code" in def1) {
            def1.code(cxt, ruleType);
        } else if (cxt.$data && def1.validate) {
            keyword.funcKeywordCode(cxt, def1);
        } else if ("macro" in def1) {
            keyword.macroKeywordCode(cxt, def1);
        } else if (def1.compile || def1.validate) {
            keyword.funcKeywordCode(cxt, def1);
        }
    }
    const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel , dataNames , dataPathArr  }) {
        let jsonPointer;
        let data;
        if ($data === "") return names_1.default.rootData;
        if ($data[0] === "/") {
            if (!JSON_POINTER.test($data)) throw new Error(`Invalid JSON-pointer: ${$data}`);
            jsonPointer = $data;
            data = names_1.default.rootData;
        } else {
            const matches = RELATIVE_JSON_POINTER.exec($data);
            if (!matches) throw new Error(`Invalid JSON-pointer: ${$data}`);
            const up = +matches[1];
            jsonPointer = matches[2];
            if (jsonPointer === "#") {
                if (up >= dataLevel) throw new Error(errorMsg("property/index", up));
                return dataPathArr[dataLevel - up];
            }
            if (up > dataLevel) throw new Error(errorMsg("data", up));
            data = dataNames[dataLevel - up];
            if (!jsonPointer) return data;
        }
        let expr = data;
        const segments = jsonPointer.split("/");
        for (const segment of segments){
            if (segment) {
                data = codegen._`${data}${codegen.getProperty(util.unescapeJsonPointer(segment))}`;
                expr = codegen._`${expr} && ${data}`;
            }
        }
        return expr;
        function errorMsg(pointerType, up) {
            return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
        }
    }
    exports.getData = getData;
});
var validation_error = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    class ValidationError extends Error {
        constructor(errors2){
            super("validation failed");
            this.errors = errors2;
            this.ajv = this.validation = true;
        }
    }
    exports.default = ValidationError;
});
var ref_error = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    class MissingRefError extends Error {
        constructor(baseId, ref2, msg){
            super(msg || `can't resolve reference ${ref2} from id ${baseId}`);
            this.missingRef = resolve.resolveUrl(baseId, ref2);
            this.missingSchema = resolve.normalizeId(resolve.getFullPath(this.missingRef));
        }
    }
    exports.default = MissingRefError;
});
var compile = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    class SchemaEnv {
        constructor(env){
            var _a;
            this.refs = {
            };
            this.dynamicAnchors = {
            };
            let schema;
            if (typeof env.schema == "object") schema = env.schema;
            this.schema = env.schema;
            this.root = env.root || this;
            this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : resolve.normalizeId(schema === null || schema === void 0 ? void 0 : schema.$id);
            this.schemaPath = env.schemaPath;
            this.localRefs = env.localRefs;
            this.meta = env.meta;
            this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
            this.refs = {
            };
        }
    }
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
        const _sch = getCompilingSchema.call(this, sch);
        if (_sch) return _sch;
        const rootId = resolve.getFullPath(sch.root.baseId);
        const { es5 , lines  } = this.opts.code;
        const { ownProperties  } = this.opts;
        const gen = new codegen.CodeGen(this.scope, {
            es5,
            lines,
            ownProperties
        });
        let _ValidationError;
        if (sch.$async) {
            _ValidationError = gen.scopeValue("Error", {
                ref: validation_error.default,
                code: codegen._`require("ajv/dist/runtime/validation_error").default`
            });
        }
        const validateName = gen.scopeName("validate");
        sch.validateName = validateName;
        const schemaCxt = {
            gen,
            allErrors: this.opts.allErrors,
            data: names_1.default.data,
            parentData: names_1.default.parentData,
            parentDataProperty: names_1.default.parentDataProperty,
            dataNames: [
                names_1.default.data
            ],
            dataPathArr: [
                codegen.nil
            ],
            dataLevel: 0,
            dataTypes: [],
            definedProperties: new Set(),
            topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? {
                ref: sch.schema,
                code: codegen.stringify(sch.schema)
            } : {
                ref: sch.schema
            }),
            validateName,
            ValidationError: _ValidationError,
            schema: sch.schema,
            schemaEnv: sch,
            rootId,
            baseId: sch.baseId || rootId,
            schemaPath: codegen.nil,
            errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
            errorPath: codegen._`""`,
            opts: this.opts,
            self: this
        };
        let sourceCode;
        try {
            this._compilations.add(sch);
            validate.validateFunctionCode(schemaCxt);
            gen.optimize(this.opts.code.optimize);
            const validateCode = gen.toString();
            sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
            if (this.opts.code.process) sourceCode = this.opts.code.process(sourceCode, sch);
            const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
            const validate$1 = makeValidate(this, this.scope.get());
            this.scope.value(validateName, {
                ref: validate$1
            });
            validate$1.errors = null;
            validate$1.schema = sch.schema;
            validate$1.schemaEnv = sch;
            if (sch.$async) validate$1.$async = true;
            if (this.opts.code.source === true) {
                validate$1.source = {
                    validateName,
                    validateCode,
                    scopeValues: gen._values
                };
            }
            if (this.opts.unevaluated) {
                const { props , items: items2  } = schemaCxt;
                validate$1.evaluated = {
                    props: props instanceof codegen.Name ? void 0 : props,
                    items: items2 instanceof codegen.Name ? void 0 : items2,
                    dynamicProps: props instanceof codegen.Name,
                    dynamicItems: items2 instanceof codegen.Name
                };
                if (validate$1.source) validate$1.source.evaluated = codegen.stringify(validate$1.evaluated);
            }
            sch.validate = validate$1;
            return sch;
        } catch (e) {
            delete sch.validate;
            delete sch.validateName;
            if (sourceCode) this.logger.error("Error compiling schema, function code:", sourceCode);
            throw e;
        } finally{
            this._compilations.delete(sch);
        }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref2) {
        var _a1;
        ref2 = resolve.resolveUrl(baseId, ref2);
        const schOrFunc = root.refs[ref2];
        if (schOrFunc) return schOrFunc;
        let _sch = resolve$1.call(this, root, ref2);
        if (_sch === void 0) {
            const schema1 = (_a1 = root.localRefs) === null || _a1 === void 0 ? void 0 : _a1[ref2];
            if (schema1) _sch = new SchemaEnv({
                schema: schema1,
                root,
                baseId
            });
        }
        if (_sch === void 0) return;
        return root.refs[ref2] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
        if (resolve.inlineRef(sch.schema, this.opts.inlineRefs)) return sch.schema;
        return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
        for (const sch of this._compilations){
            if (sameSchemaEnv(sch, schEnv)) return sch;
        }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
        return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve$1(root, ref2) {
        let sch;
        while(typeof (sch = this.refs[ref2]) == "string")ref2 = sch;
        return sch || this.schemas[ref2] || resolveSchema.call(this, root, ref2);
    }
    function resolveSchema(root, ref2) {
        const p = __pika_web_default_export_for_treeshaking__.parse(ref2);
        const refPath = resolve._getFullPath(p);
        let baseId = resolve.getFullPath(root.baseId);
        if (Object.keys(root.schema).length > 0 && refPath === baseId) {
            return getJsonPointer.call(this, p, root);
        }
        const id2 = resolve.normalizeId(refPath);
        const schOrRef = this.refs[id2] || this.schemas[id2];
        if (typeof schOrRef == "string") {
            const sch = resolveSchema.call(this, root, schOrRef);
            if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object") return;
            return getJsonPointer.call(this, p, sch);
        }
        if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object") return;
        if (!schOrRef.validate) compileSchema.call(this, schOrRef);
        if (id2 === resolve.normalizeId(ref2)) {
            const { schema: schema1  } = schOrRef;
            if (schema1.$id) baseId = resolve.resolveUrl(baseId, schema1.$id);
            return new SchemaEnv({
                schema: schema1,
                root,
                baseId
            });
        }
        return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    const PREVENT_SCOPE_CHANGE = new Set([
        "properties",
        "patternProperties",
        "enum",
        "dependencies",
        "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId , schema: schema1 , root  }) {
        var _a1;
        if (((_a1 = parsedRef.fragment) === null || _a1 === void 0 ? void 0 : _a1[0]) !== "/") return;
        for (const part of parsedRef.fragment.slice(1).split("/")){
            if (typeof schema1 == "boolean") return;
            schema1 = schema1[util.unescapeFragment(part)];
            if (schema1 === void 0) return;
            if (!PREVENT_SCOPE_CHANGE.has(part) && typeof schema1 == "object" && schema1.$id) {
                baseId = resolve.resolveUrl(baseId, schema1.$id);
            }
        }
        let env1;
        if (typeof schema1 != "boolean" && schema1.$ref && !util.schemaHasRulesButRef(schema1, this.RULES)) {
            const $ref = resolve.resolveUrl(baseId, schema1.$ref);
            env1 = resolveSchema.call(this, root, $ref);
        }
        env1 = env1 || new SchemaEnv({
            schema: schema1,
            root,
            baseId
        });
        if (env1.schema !== env1.root.schema) return env1;
        return void 0;
    }
});
const $id = "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#";
const description = "Meta-schema for $data reference (JSON AnySchema extension proposal)";
const type = "object";
const required = [
    "$data"
];
const properties1 = {
    $data: {
        type: "string",
        anyOf: [
            {
                format: "relative-json-pointer"
            },
            {
                format: "json-pointer"
            }
        ]
    }
};
var $dataRefSchema = {
    $id,
    description,
    type,
    required,
    properties: properties1,
    additionalProperties: false
};
var core = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    Object.defineProperty(exports, "KeywordCxt", {
        enumerable: true,
        get: function() {
            return validate.KeywordCxt;
        }
    });
    Object.defineProperty(exports, "_", {
        enumerable: true,
        get: function() {
            return codegen._;
        }
    });
    Object.defineProperty(exports, "str", {
        enumerable: true,
        get: function() {
            return codegen.str;
        }
    });
    Object.defineProperty(exports, "stringify", {
        enumerable: true,
        get: function() {
            return codegen.stringify;
        }
    });
    Object.defineProperty(exports, "nil", {
        enumerable: true,
        get: function() {
            return codegen.nil;
        }
    });
    Object.defineProperty(exports, "Name", {
        enumerable: true,
        get: function() {
            return codegen.Name;
        }
    });
    Object.defineProperty(exports, "CodeGen", {
        enumerable: true,
        get: function() {
            return codegen.CodeGen;
        }
    });
    const codegen_2 = codegen;
    const META_IGNORE_OPTIONS = [
        "removeAdditional",
        "useDefaults",
        "coerceTypes"
    ];
    const EXT_SCOPE_NAMES = new Set([
        "validate",
        "serialize",
        "parse",
        "wrapper",
        "root",
        "schema",
        "keyword",
        "pattern",
        "formats",
        "validate$data",
        "func",
        "obj",
        "Error"
    ]);
    const removedOptions = {
        errorDataPath: "",
        format: "`validateFormats: false` can be used instead.",
        nullable: '"nullable" keyword is supported by default.',
        jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
        extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
        missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
        processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
        sourceCode: "Use option `code: {source: true}`",
        schemaId: "JSON Schema draft-04 is not supported in Ajv v7/8.",
        strictDefaults: "It is default now, see option `strict`.",
        strictKeywords: "It is default now, see option `strict`.",
        uniqueItems: '"uniqueItems" keyword is always validated.',
        unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
        cache: "Map is used as cache, schema object as key.",
        serialize: "Map is used as cache, schema object as key.",
        ajvErrors: "It is default now, see option `strict`."
    };
    const deprecatedOptions = {
        ignoreKeywordsWithRef: "",
        jsPropertySyntax: "",
        unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    const MAX_EXPRESSION = 200;
    function requiredOptions(o) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        const s = o.strict;
        const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
        const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
        return {
            strictSchema: (_c = (_b = o.strictSchema) !== null && _b !== void 0 ? _b : s) !== null && _c !== void 0 ? _c : true,
            strictNumbers: (_e = (_d = o.strictNumbers) !== null && _d !== void 0 ? _d : s) !== null && _e !== void 0 ? _e : true,
            strictTypes: (_g = (_f = o.strictTypes) !== null && _f !== void 0 ? _f : s) !== null && _g !== void 0 ? _g : "log",
            strictTuples: (_j = (_h = o.strictTuples) !== null && _h !== void 0 ? _h : s) !== null && _j !== void 0 ? _j : "log",
            strictRequired: (_l = (_k = o.strictRequired) !== null && _k !== void 0 ? _k : s) !== null && _l !== void 0 ? _l : false,
            code: o.code ? {
                ...o.code,
                optimize
            } : {
                optimize
            },
            loopRequired: (_m = o.loopRequired) !== null && _m !== void 0 ? _m : 200,
            loopEnum: (_o = o.loopEnum) !== null && _o !== void 0 ? _o : 200,
            meta: (_p = o.meta) !== null && _p !== void 0 ? _p : true,
            messages: (_q = o.messages) !== null && _q !== void 0 ? _q : true,
            inlineRefs: (_r = o.inlineRefs) !== null && _r !== void 0 ? _r : true,
            addUsedSchema: (_s = o.addUsedSchema) !== null && _s !== void 0 ? _s : true,
            validateSchema: (_t = o.validateSchema) !== null && _t !== void 0 ? _t : true,
            validateFormats: (_u = o.validateFormats) !== null && _u !== void 0 ? _u : true,
            unicodeRegExp: (_v = o.unicodeRegExp) !== null && _v !== void 0 ? _v : true
        };
    }
    class Ajv {
        constructor(opts = {
        }){
            this.schemas = {
            };
            this.refs = {
            };
            this.formats = {
            };
            this._compilations = new Set();
            this._loading = {
            };
            this._cache = new Map();
            opts = this.opts = {
                ...opts,
                ...requiredOptions(opts)
            };
            const { es5 , lines  } = this.opts.code;
            this.scope = new codegen_2.ValueScope({
                scope: {
                },
                prefixes: EXT_SCOPE_NAMES,
                es5,
                lines
            });
            this.logger = getLogger(opts.logger);
            const formatOpt = opts.validateFormats;
            opts.validateFormats = false;
            this.RULES = rules.getRules();
            checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
            checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
            this._metaOpts = getMetaSchemaOptions.call(this);
            if (opts.formats) addInitialFormats.call(this);
            this._addVocabularies();
            this._addDefaultMetaSchema();
            if (opts.keywords) addInitialKeywords.call(this, opts.keywords);
            if (typeof opts.meta == "object") this.addMetaSchema(opts.meta);
            addInitialSchemas.call(this);
            opts.validateFormats = formatOpt;
        }
        _addVocabularies() {
            this.addKeyword("$async");
        }
        _addDefaultMetaSchema() {
            const { $data , meta  } = this.opts;
            if (meta && $data) this.addMetaSchema($dataRefSchema, $dataRefSchema.$id, false);
        }
        defaultMeta() {
            const { meta  } = this.opts;
            return this.opts.defaultMeta = typeof meta == "object" ? meta.$id || meta : void 0;
        }
        validate(schemaKeyRef, data) {
            let v;
            if (typeof schemaKeyRef == "string") {
                v = this.getSchema(schemaKeyRef);
                if (!v) throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
            } else {
                v = this.compile(schemaKeyRef);
            }
            const valid = v(data);
            if (!("$async" in v)) this.errors = v.errors;
            return valid;
        }
        compile(schema, _meta) {
            const sch = this._addSchema(schema, _meta);
            return sch.validate || this._compileSchemaEnv(sch);
        }
        compileAsync(schema, meta) {
            if (typeof this.opts.loadSchema != "function") {
                throw new Error("options.loadSchema should be a function");
            }
            const { loadSchema  } = this.opts;
            return runCompileAsync.call(this, schema, meta);
            async function runCompileAsync(_schema, _meta) {
                await loadMetaSchema.call(this, _schema.$schema);
                const sch = this._addSchema(_schema, _meta);
                return sch.validate || _compileAsync.call(this, sch);
            }
            async function loadMetaSchema($ref) {
                if ($ref && !this.getSchema($ref)) {
                    await runCompileAsync.call(this, {
                        $ref
                    }, true);
                }
            }
            async function _compileAsync(sch) {
                try {
                    return this._compileSchemaEnv(sch);
                } catch (e) {
                    if (!(e instanceof ref_error.default)) throw e;
                    checkLoaded.call(this, e);
                    await loadMissingSchema.call(this, e.missingSchema);
                    return _compileAsync.call(this, sch);
                }
            }
            function checkLoaded({ missingSchema: ref2 , missingRef  }) {
                if (this.refs[ref2]) {
                    throw new Error(`AnySchema ${ref2} is loaded but ${missingRef} cannot be resolved`);
                }
            }
            async function loadMissingSchema(ref2) {
                const _schema = await _loadSchema.call(this, ref2);
                if (!this.refs[ref2]) await loadMetaSchema.call(this, _schema.$schema);
                if (!this.refs[ref2]) this.addSchema(_schema, ref2, meta);
            }
            async function _loadSchema(ref2) {
                const p = this._loading[ref2];
                if (p) return p;
                try {
                    return await (this._loading[ref2] = loadSchema(ref2));
                } finally{
                    delete this._loading[ref2];
                }
            }
        }
        addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
            if (Array.isArray(schema)) {
                for (const sch of schema)this.addSchema(sch, void 0, _meta, _validateSchema);
                return this;
            }
            let id2;
            if (typeof schema === "object") {
                id2 = schema.$id;
                if (id2 !== void 0 && typeof id2 != "string") throw new Error("schema $id must be string");
            }
            key = resolve.normalizeId(key || id2);
            this._checkUnique(key);
            this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
            return this;
        }
        addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
            this.addSchema(schema, key, true, _validateSchema);
            return this;
        }
        validateSchema(schema, throwOrLogError) {
            if (typeof schema == "boolean") return true;
            let $schema2;
            $schema2 = schema.$schema;
            if ($schema2 !== void 0 && typeof $schema2 != "string") {
                throw new Error("$schema must be a string");
            }
            $schema2 = $schema2 || this.opts.defaultMeta || this.defaultMeta();
            if (!$schema2) {
                this.logger.warn("meta-schema not available");
                this.errors = null;
                return true;
            }
            const valid = this.validate($schema2, schema);
            if (!valid && throwOrLogError) {
                const message1 = "schema is invalid: " + this.errorsText();
                if (this.opts.validateSchema === "log") this.logger.error(message1);
                else throw new Error(message1);
            }
            return valid;
        }
        getSchema(keyRef) {
            let sch;
            while(typeof (sch = getSchEnv.call(this, keyRef)) == "string")keyRef = sch;
            if (sch === void 0) {
                const root = new compile.SchemaEnv({
                    schema: {
                    }
                });
                sch = compile.resolveSchema.call(this, root, keyRef);
                if (!sch) return;
                this.refs[keyRef] = sch;
            }
            return sch.validate || this._compileSchemaEnv(sch);
        }
        removeSchema(schemaKeyRef) {
            if (schemaKeyRef instanceof RegExp) {
                this._removeAllSchemas(this.schemas, schemaKeyRef);
                this._removeAllSchemas(this.refs, schemaKeyRef);
                return this;
            }
            switch(typeof schemaKeyRef){
                case "undefined":
                    this._removeAllSchemas(this.schemas);
                    this._removeAllSchemas(this.refs);
                    this._cache.clear();
                    return this;
                case "string":
                    {
                        const sch = getSchEnv.call(this, schemaKeyRef);
                        if (typeof sch == "object") this._cache.delete(sch.schema);
                        delete this.schemas[schemaKeyRef];
                        delete this.refs[schemaKeyRef];
                        return this;
                    }
                case "object":
                    {
                        const cacheKey = schemaKeyRef;
                        this._cache.delete(cacheKey);
                        let id2 = schemaKeyRef.$id;
                        if (id2) {
                            id2 = resolve.normalizeId(id2);
                            delete this.schemas[id2];
                            delete this.refs[id2];
                        }
                        return this;
                    }
                default:
                    throw new Error("ajv.removeSchema: invalid parameter");
            }
        }
        addVocabulary(definitions2) {
            for (const def of definitions2)this.addKeyword(def);
            return this;
        }
        addKeyword(kwdOrDef, def) {
            let keyword2;
            if (typeof kwdOrDef == "string") {
                keyword2 = kwdOrDef;
                if (typeof def == "object") {
                    this.logger.warn("these parameters are deprecated, see docs for addKeyword");
                    def.keyword = keyword2;
                }
            } else if (typeof kwdOrDef == "object" && def === void 0) {
                def = kwdOrDef;
                keyword2 = def.keyword;
                if (Array.isArray(keyword2) && !keyword2.length) {
                    throw new Error("addKeywords: keyword must be string or non-empty array");
                }
            } else {
                throw new Error("invalid addKeywords parameters");
            }
            checkKeyword.call(this, keyword2, def);
            if (!def) {
                util.eachItem(keyword2, (kwd)=>addRule.call(this, kwd)
                );
                return this;
            }
            keywordMetaschema.call(this, def);
            const definition = {
                ...def,
                type: dataType.getJSONTypes(def.type),
                schemaType: dataType.getJSONTypes(def.schemaType)
            };
            util.eachItem(keyword2, definition.type.length === 0 ? (k)=>addRule.call(this, k, definition)
             : (k)=>definition.type.forEach((t)=>addRule.call(this, k, definition, t)
                )
            );
            return this;
        }
        getKeyword(keyword2) {
            const rule = this.RULES.all[keyword2];
            return typeof rule == "object" ? rule.definition : !!rule;
        }
        removeKeyword(keyword2) {
            const { RULES  } = this;
            delete RULES.keywords[keyword2];
            delete RULES.all[keyword2];
            for (const group of RULES.rules){
                const i = group.rules.findIndex((rule)=>rule.keyword === keyword2
                );
                if (i >= 0) group.rules.splice(i, 1);
            }
            return this;
        }
        addFormat(name, format2) {
            if (typeof format2 == "string") format2 = new RegExp(format2);
            this.formats[name] = format2;
            return this;
        }
        errorsText(errors2 = this.errors, { separator =", " , dataVar ="data"  } = {
        }) {
            if (!errors2 || errors2.length === 0) return "No errors";
            return errors2.map((e)=>`${dataVar}${e.instancePath} ${e.message}`
            ).reduce((text, msg)=>text + separator + msg
            );
        }
        $dataMetaSchema(metaSchema, keywordsJsonPointers) {
            const rules2 = this.RULES.all;
            metaSchema = JSON.parse(JSON.stringify(metaSchema));
            for (const jsonPointer of keywordsJsonPointers){
                const segments = jsonPointer.split("/").slice(1);
                let keywords = metaSchema;
                for (const seg of segments)keywords = keywords[seg];
                for(const key in rules2){
                    const rule = rules2[key];
                    if (typeof rule != "object") continue;
                    const { $data  } = rule.definition;
                    const schema = keywords[key];
                    if ($data && schema) keywords[key] = schemaOrData(schema);
                }
            }
            return metaSchema;
        }
        _removeAllSchemas(schemas, regex) {
            for(const keyRef in schemas){
                const sch = schemas[keyRef];
                if (!regex || regex.test(keyRef)) {
                    if (typeof sch == "string") {
                        delete schemas[keyRef];
                    } else if (sch && !sch.meta) {
                        this._cache.delete(sch.schema);
                        delete schemas[keyRef];
                    }
                }
            }
        }
        _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
            let id2;
            if (typeof schema == "object") {
                id2 = schema.$id;
            } else {
                if (this.opts.jtd) throw new Error("schema must be object");
                else if (typeof schema != "boolean") throw new Error("schema must be object or boolean");
            }
            let sch = this._cache.get(schema);
            if (sch !== void 0) return sch;
            const localRefs = resolve.getSchemaRefs.call(this, schema);
            baseId = resolve.normalizeId(id2 || baseId);
            sch = new compile.SchemaEnv({
                schema,
                meta,
                baseId,
                localRefs
            });
            this._cache.set(sch.schema, sch);
            if (addSchema && !baseId.startsWith("#")) {
                if (baseId) this._checkUnique(baseId);
                this.refs[baseId] = sch;
            }
            if (validateSchema) this.validateSchema(schema, true);
            return sch;
        }
        _checkUnique(id2) {
            if (this.schemas[id2] || this.refs[id2]) {
                throw new Error(`schema with key or id "${id2}" already exists`);
            }
        }
        _compileSchemaEnv(sch) {
            if (sch.meta) this._compileMetaSchema(sch);
            else compile.compileSchema.call(this, sch);
            if (!sch.validate) throw new Error("ajv implementation error");
            return sch.validate;
        }
        _compileMetaSchema(sch) {
            const currentOpts = this.opts;
            this.opts = this._metaOpts;
            try {
                compile.compileSchema.call(this, sch);
            } finally{
                this.opts = currentOpts;
            }
        }
    }
    exports.default = Ajv;
    Ajv.ValidationError = validation_error.default;
    Ajv.MissingRefError = ref_error.default;
    function checkOptions(checkOpts, options, msg, log = "error") {
        for(const key in checkOpts){
            const opt = key;
            if (opt in options) this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
        }
    }
    function getSchEnv(keyRef) {
        keyRef = resolve.normalizeId(keyRef);
        return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
        const optsSchemas = this.opts.schemas;
        if (!optsSchemas) return;
        if (Array.isArray(optsSchemas)) this.addSchema(optsSchemas);
        else for(const key in optsSchemas)this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
        for(const name in this.opts.formats){
            const format2 = this.opts.formats[name];
            if (format2) this.addFormat(name, format2);
        }
    }
    function addInitialKeywords(defs) {
        if (Array.isArray(defs)) {
            this.addVocabulary(defs);
            return;
        }
        this.logger.warn("keywords option as map is deprecated, pass array");
        for(const keyword2 in defs){
            const def = defs[keyword2];
            if (!def.keyword) def.keyword = keyword2;
            this.addKeyword(def);
        }
    }
    function getMetaSchemaOptions() {
        const metaOpts = {
            ...this.opts
        };
        for (const opt of META_IGNORE_OPTIONS)delete metaOpts[opt];
        return metaOpts;
    }
    const noLogs = {
        log () {
        },
        warn () {
        },
        error () {
        }
    };
    function getLogger(logger) {
        if (logger === false) return noLogs;
        if (logger === void 0) return console;
        if (logger.log && logger.warn && logger.error) return logger;
        throw new Error("logger must implement log, warn and error methods");
    }
    const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword2, def) {
        const { RULES  } = this;
        util.eachItem(keyword2, (kwd)=>{
            if (RULES.keywords[kwd]) throw new Error(`Keyword ${kwd} is already defined`);
            if (!KEYWORD_NAME.test(kwd)) throw new Error(`Keyword ${kwd} has invalid name`);
        });
        if (!def) return;
        if (def.$data && !("code" in def || "validate" in def)) {
            throw new Error('$data keyword must have "code" or "validate" function');
        }
    }
    function addRule(keyword2, definition, dataType$1) {
        var _a;
        const post = definition === null || definition === void 0 ? void 0 : definition.post;
        if (dataType$1 && post) throw new Error('keyword with "post" flag cannot have "type"');
        const { RULES  } = this;
        let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t  })=>t === dataType$1
        );
        if (!ruleGroup) {
            ruleGroup = {
                type: dataType$1,
                rules: []
            };
            RULES.rules.push(ruleGroup);
        }
        RULES.keywords[keyword2] = true;
        if (!definition) return;
        const rule = {
            keyword: keyword2,
            definition: {
                ...definition,
                type: dataType.getJSONTypes(definition.type),
                schemaType: dataType.getJSONTypes(definition.schemaType)
            }
        };
        if (definition.before) addBeforeRule.call(this, ruleGroup, rule, definition.before);
        else ruleGroup.rules.push(rule);
        RULES.all[keyword2] = rule;
        (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd)=>this.addKeyword(kwd)
        );
    }
    function addBeforeRule(ruleGroup, rule, before) {
        const i = ruleGroup.rules.findIndex((_rule)=>_rule.keyword === before
        );
        if (i >= 0) {
            ruleGroup.rules.splice(i, 0, rule);
        } else {
            ruleGroup.rules.push(rule);
            this.logger.warn(`rule ${before} is not defined`);
        }
    }
    function keywordMetaschema(def) {
        let { metaSchema  } = def;
        if (metaSchema === void 0) return;
        if (def.$data && this.opts.$data) metaSchema = schemaOrData(metaSchema);
        def.validateSchema = this.compile(metaSchema, true);
    }
    const $dataRef = {
        $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
        return {
            anyOf: [
                schema,
                $dataRef
            ]
        };
    }
});
var id = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const def = {
        keyword: "id",
        code () {
            throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
        }
    };
    exports.default = def;
});
var ref = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.callRef = exports.getValidate = void 0;
    const def = {
        keyword: "$ref",
        schemaType: "string",
        code (cxt) {
            const { gen , schema: $ref , it  } = cxt;
            const { baseId , schemaEnv: env , validateName , opts , self  } = it;
            const { root  } = env;
            if (($ref === "#" || $ref === "#/") && baseId === root.baseId) return callRootRef();
            const schOrEnv = compile.resolveRef.call(self, root, baseId, $ref);
            if (schOrEnv === void 0) throw new ref_error.default(baseId, $ref);
            if (schOrEnv instanceof compile.SchemaEnv) return callValidate(schOrEnv);
            return inlineRefSchema(schOrEnv);
            function callRootRef() {
                if (env === root) return callRef(cxt, validateName, env, env.$async);
                const rootName = gen.scopeValue("root", {
                    ref: root
                });
                return callRef(cxt, codegen._`${rootName}.validate`, root, root.$async);
            }
            function callValidate(sch) {
                const v = getValidate(cxt, sch);
                callRef(cxt, v, sch, sch.$async);
            }
            function inlineRefSchema(sch) {
                const schName = gen.scopeValue("schema", opts.code.source === true ? {
                    ref: sch,
                    code: codegen.stringify(sch)
                } : {
                    ref: sch
                });
                const valid = gen.name("valid");
                const schCxt = cxt.subschema({
                    schema: sch,
                    dataTypes: [],
                    schemaPath: codegen.nil,
                    topSchemaRef: schName,
                    errSchemaPath: $ref
                }, valid);
                cxt.mergeEvaluated(schCxt);
                cxt.ok(valid);
            }
        }
    };
    function getValidate(cxt, sch) {
        const { gen  } = cxt;
        return sch.validate ? gen.scopeValue("validate", {
            ref: sch.validate
        }) : codegen._`${gen.scopeValue("wrapper", {
            ref: sch
        })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
        const { gen , it  } = cxt;
        const { allErrors , schemaEnv: env , opts  } = it;
        const passCxt = opts.passContext ? names_1.default.this : codegen.nil;
        if ($async) callAsyncRef();
        else callSyncRef();
        function callAsyncRef() {
            if (!env.$async) throw new Error("async schema referenced by sync schema");
            const valid = gen.let("valid");
            gen.try(()=>{
                gen.code(codegen._`await ${code$1.callValidateCode(cxt, v, passCxt)}`);
                addEvaluatedFrom(v);
                if (!allErrors) gen.assign(valid, true);
            }, (e)=>{
                gen.if(codegen._`!(${e} instanceof ${it.ValidationError})`, ()=>gen.throw(e)
                );
                addErrorsFrom(e);
                if (!allErrors) gen.assign(valid, false);
            });
            cxt.ok(valid);
        }
        function callSyncRef() {
            cxt.result(code$1.callValidateCode(cxt, v, passCxt), ()=>addEvaluatedFrom(v)
            , ()=>addErrorsFrom(v)
            );
        }
        function addErrorsFrom(source) {
            const errs = codegen._`${source}.errors`;
            gen.assign(names_1.default.vErrors, codegen._`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
            gen.assign(names_1.default.errors, codegen._`${names_1.default.vErrors}.length`);
        }
        function addEvaluatedFrom(source) {
            var _a;
            if (!it.opts.unevaluated) return;
            const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
            if (it.props !== true) {
                if (schEvaluated && !schEvaluated.dynamicProps) {
                    if (schEvaluated.props !== void 0) {
                        it.props = util.mergeEvaluated.props(gen, schEvaluated.props, it.props);
                    }
                } else {
                    const props = gen.var("props", codegen._`${source}.evaluated.props`);
                    it.props = util.mergeEvaluated.props(gen, props, it.props, codegen.Name);
                }
            }
            if (it.items !== true) {
                if (schEvaluated && !schEvaluated.dynamicItems) {
                    if (schEvaluated.items !== void 0) {
                        it.items = util.mergeEvaluated.items(gen, schEvaluated.items, it.items);
                    }
                } else {
                    const items2 = gen.var("items", codegen._`${source}.evaluated.items`);
                    it.items = util.mergeEvaluated.items(gen, items2, it.items, codegen.Name);
                }
            }
        }
    }
    exports.callRef = callRef;
    exports.default = def;
});
var core_1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const core2 = [
        "$schema",
        "$id",
        "$defs",
        "$vocabulary",
        {
            keyword: "$comment"
        },
        "definitions",
        id.default,
        ref.default
    ];
    exports.default = core2;
});
var limitNumber = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const ops = codegen.operators;
    const KWDs = {
        maximum: {
            okStr: "<=",
            ok: ops.LTE,
            fail: ops.GT
        },
        minimum: {
            okStr: ">=",
            ok: ops.GTE,
            fail: ops.LT
        },
        exclusiveMaximum: {
            okStr: "<",
            ok: ops.LT,
            fail: ops.GTE
        },
        exclusiveMinimum: {
            okStr: ">",
            ok: ops.GT,
            fail: ops.LTE
        }
    };
    const error = {
        message: ({ keyword: keyword2 , schemaCode  })=>codegen.str`must be ${KWDs[keyword2].okStr} ${schemaCode}`
        ,
        params: ({ keyword: keyword2 , schemaCode  })=>codegen._`{comparison: ${KWDs[keyword2].okStr}, limit: ${schemaCode}}`
    };
    const def = {
        keyword: Object.keys(KWDs),
        type: "number",
        schemaType: "number",
        $data: true,
        error,
        code (cxt) {
            const { keyword: keyword2 , data , schemaCode  } = cxt;
            cxt.fail$data(codegen._`${data} ${KWDs[keyword2].fail} ${schemaCode} || isNaN(${data})`);
        }
    };
    exports.default = def;
});
var multipleOf = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ schemaCode  })=>codegen.str`must be multiple of ${schemaCode}`
        ,
        params: ({ schemaCode  })=>codegen._`{multipleOf: ${schemaCode}}`
    };
    const def = {
        keyword: "multipleOf",
        type: "number",
        schemaType: "number",
        $data: true,
        error,
        code (cxt) {
            const { gen , data , schemaCode , it  } = cxt;
            const prec = it.opts.multipleOfPrecision;
            const res = gen.let("res");
            const invalid = prec ? codegen._`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : codegen._`${res} !== parseInt(${res})`;
            cxt.fail$data(codegen._`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
        }
    };
    exports.default = def;
});
var ucs2length_1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    function ucs2length(str2) {
        const len = str2.length;
        let length = 0;
        let pos = 0;
        let value;
        while(pos < len){
            length++;
            value = str2.charCodeAt(pos++);
            if (value >= 55296 && value <= 56319 && pos < len) {
                value = str2.charCodeAt(pos);
                if ((value & 64512) === 56320) pos++;
            }
        }
        return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
});
var limitLength = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message ({ keyword: keyword2 , schemaCode  }) {
            const comp = keyword2 === "maxLength" ? "more" : "fewer";
            return codegen.str`must NOT have ${comp} than ${schemaCode} characters`;
        },
        params: ({ schemaCode  })=>codegen._`{limit: ${schemaCode}}`
    };
    const def = {
        keyword: [
            "maxLength",
            "minLength"
        ],
        type: "string",
        schemaType: "number",
        $data: true,
        error,
        code (cxt) {
            const { keyword: keyword2 , data , schemaCode , it  } = cxt;
            const op = keyword2 === "maxLength" ? codegen.operators.GT : codegen.operators.LT;
            const len = it.opts.unicode === false ? codegen._`${data}.length` : codegen._`${util.useFunc(cxt.gen, ucs2length_1.default)}(${data})`;
            cxt.fail$data(codegen._`${len} ${op} ${schemaCode}`);
        }
    };
    exports.default = def;
});
var pattern = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ schemaCode  })=>codegen.str`must match pattern "${schemaCode}"`
        ,
        params: ({ schemaCode  })=>codegen._`{pattern: ${schemaCode}}`
    };
    const def = {
        keyword: "pattern",
        type: "string",
        schemaType: "string",
        $data: true,
        error,
        code (cxt) {
            const { data , $data , schema , schemaCode , it  } = cxt;
            const u = it.opts.unicodeRegExp ? "u" : "";
            const regExp = $data ? codegen._`(new RegExp(${schemaCode}, ${u}))` : code$1.usePattern(cxt, schema);
            cxt.fail$data(codegen._`!${regExp}.test(${data})`);
        }
    };
    exports.default = def;
});
var limitProperties = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message ({ keyword: keyword2 , schemaCode  }) {
            const comp = keyword2 === "maxProperties" ? "more" : "fewer";
            return codegen.str`must NOT have ${comp} than ${schemaCode} items`;
        },
        params: ({ schemaCode  })=>codegen._`{limit: ${schemaCode}}`
    };
    const def = {
        keyword: [
            "maxProperties",
            "minProperties"
        ],
        type: "object",
        schemaType: "number",
        $data: true,
        error,
        code (cxt) {
            const { keyword: keyword2 , data , schemaCode  } = cxt;
            const op = keyword2 === "maxProperties" ? codegen.operators.GT : codegen.operators.LT;
            cxt.fail$data(codegen._`Object.keys(${data}).length ${op} ${schemaCode}`);
        }
    };
    exports.default = def;
});
var required$1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ params: { missingProperty  }  })=>codegen.str`must have required property '${missingProperty}'`
        ,
        params: ({ params: { missingProperty  }  })=>codegen._`{missingProperty: ${missingProperty}}`
    };
    const def = {
        keyword: "required",
        type: "object",
        schemaType: "array",
        $data: true,
        error,
        code (cxt) {
            const { gen , schema , schemaCode , data , $data , it  } = cxt;
            const { opts  } = it;
            if (!$data && schema.length === 0) return;
            const useLoop = schema.length >= opts.loopRequired;
            if (it.allErrors) allErrorsMode();
            else exitOnErrorMode();
            if (opts.strictRequired) {
                const props = cxt.parentSchema.properties;
                const { definedProperties  } = cxt.it;
                for (const requiredKey of schema){
                    if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
                        const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
                        const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
                        util.checkStrictMode(it, msg, it.opts.strictRequired);
                    }
                }
            }
            function allErrorsMode() {
                if (useLoop || $data) {
                    cxt.block$data(codegen.nil, loopAllRequired);
                } else {
                    for (const prop of schema){
                        code$1.checkReportMissingProp(cxt, prop);
                    }
                }
            }
            function exitOnErrorMode() {
                const missing = gen.let("missing");
                if (useLoop || $data) {
                    const valid = gen.let("valid", true);
                    cxt.block$data(valid, ()=>loopUntilMissing(missing, valid)
                    );
                    cxt.ok(valid);
                } else {
                    gen.if(code$1.checkMissingProp(cxt, schema, missing));
                    code$1.reportMissingProp(cxt, missing);
                    gen.else();
                }
            }
            function loopAllRequired() {
                gen.forOf("prop", schemaCode, (prop)=>{
                    cxt.setParams({
                        missingProperty: prop
                    });
                    gen.if(code$1.noPropertyInData(gen, data, prop, opts.ownProperties), ()=>cxt.error()
                    );
                });
            }
            function loopUntilMissing(missing, valid) {
                cxt.setParams({
                    missingProperty: missing
                });
                gen.forOf(missing, schemaCode, ()=>{
                    gen.assign(valid, code$1.propertyInData(gen, data, missing, opts.ownProperties));
                    gen.if(codegen.not(valid), ()=>{
                        cxt.error();
                        gen.break();
                    });
                }, codegen.nil);
            }
        }
    };
    exports.default = def;
});
var limitItems = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message ({ keyword: keyword2 , schemaCode  }) {
            const comp = keyword2 === "maxItems" ? "more" : "fewer";
            return codegen.str`must NOT have ${comp} than ${schemaCode} items`;
        },
        params: ({ schemaCode  })=>codegen._`{limit: ${schemaCode}}`
    };
    const def = {
        keyword: [
            "maxItems",
            "minItems"
        ],
        type: "array",
        schemaType: "number",
        $data: true,
        error,
        code (cxt) {
            const { keyword: keyword2 , data , schemaCode  } = cxt;
            const op = keyword2 === "maxItems" ? codegen.operators.GT : codegen.operators.LT;
            cxt.fail$data(codegen._`${data}.length ${op} ${schemaCode}`);
        }
    };
    exports.default = def;
});
var equal_1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    fastDeepEqual.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = fastDeepEqual;
});
var uniqueItems = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ params: { i , j  }  })=>codegen.str`must NOT have duplicate items (items ## ${j} and ${i} are identical)`
        ,
        params: ({ params: { i , j  }  })=>codegen._`{i: ${i}, j: ${j}}`
    };
    const def = {
        keyword: "uniqueItems",
        type: "array",
        schemaType: "boolean",
        $data: true,
        error,
        code (cxt) {
            const { gen , data , $data , schema , parentSchema , schemaCode , it  } = cxt;
            if (!$data && !schema) return;
            const valid = gen.let("valid");
            const itemTypes = parentSchema.items ? dataType.getSchemaTypes(parentSchema.items) : [];
            cxt.block$data(valid, validateUniqueItems, codegen._`${schemaCode} === false`);
            cxt.ok(valid);
            function validateUniqueItems() {
                const i = gen.let("i", codegen._`${data}.length`);
                const j = gen.let("j");
                cxt.setParams({
                    i,
                    j
                });
                gen.assign(valid, true);
                gen.if(codegen._`${i} > 1`, ()=>(canOptimize() ? loopN : loopN2)(i, j)
                );
            }
            function canOptimize() {
                return itemTypes.length > 0 && !itemTypes.some((t)=>t === "object" || t === "array"
                );
            }
            function loopN(i, j) {
                const item = gen.name("item");
                const wrongType = dataType.checkDataTypes(itemTypes, item, it.opts.strictNumbers, dataType.DataType.Wrong);
                const indices = gen.const("indices", codegen._`{}`);
                gen.for(codegen._`;${i}--;`, ()=>{
                    gen.let(item, codegen._`${data}[${i}]`);
                    gen.if(wrongType, codegen._`continue`);
                    if (itemTypes.length > 1) gen.if(codegen._`typeof ${item} == "string"`, codegen._`${item} += "_"`);
                    gen.if(codegen._`typeof ${indices}[${item}] == "number"`, ()=>{
                        gen.assign(j, codegen._`${indices}[${item}]`);
                        cxt.error();
                        gen.assign(valid, false).break();
                    }).code(codegen._`${indices}[${item}] = ${i}`);
                });
            }
            function loopN2(i, j) {
                const eql = util.useFunc(gen, equal_1.default);
                const outer = gen.name("outer");
                gen.label(outer).for(codegen._`;${i}--;`, ()=>gen.for(codegen._`${j} = ${i}; ${j}--;`, ()=>gen.if(codegen._`${eql}(${data}[${i}], ${data}[${j}])`, ()=>{
                            cxt.error();
                            gen.assign(valid, false).break(outer);
                        })
                    )
                );
            }
        }
    };
    exports.default = def;
});
var _const = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: "must be equal to constant",
        params: ({ schemaCode  })=>codegen._`{allowedValue: ${schemaCode}}`
    };
    const def = {
        keyword: "const",
        $data: true,
        error,
        code (cxt) {
            const { gen , data , schemaCode  } = cxt;
            cxt.fail$data(codegen._`!${util.useFunc(gen, equal_1.default)}(${data}, ${schemaCode})`);
        }
    };
    exports.default = def;
});
var _enum = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: "must be equal to one of the allowed values",
        params: ({ schemaCode  })=>codegen._`{allowedValues: ${schemaCode}}`
    };
    const def = {
        keyword: "enum",
        schemaType: "array",
        $data: true,
        error,
        code (cxt) {
            const { gen , data , $data , schema , schemaCode , it  } = cxt;
            if (!$data && schema.length === 0) throw new Error("enum must have non-empty array");
            const useLoop = schema.length >= it.opts.loopEnum;
            const eql = util.useFunc(gen, equal_1.default);
            let valid;
            if (useLoop || $data) {
                valid = gen.let("valid");
                cxt.block$data(valid, loopEnum);
            } else {
                if (!Array.isArray(schema)) throw new Error("ajv implementation error");
                const vSchema = gen.const("vSchema", schemaCode);
                valid = codegen.or(...schema.map((_x, i)=>equalCode(vSchema, i)
                ));
            }
            cxt.pass(valid);
            function loopEnum() {
                gen.assign(valid, false);
                gen.forOf("v", schemaCode, (v)=>gen.if(codegen._`${eql}(${data}, ${v})`, ()=>gen.assign(valid, true).break()
                    )
                );
            }
            function equalCode(vSchema, i) {
                const sch = schema[i];
                return sch && typeof sch === "object" ? codegen._`${eql}(${data}, ${vSchema}[${i}])` : codegen._`${data} === ${sch}`;
            }
        }
    };
    exports.default = def;
});
var validation_1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const validation = [
        limitNumber.default,
        multipleOf.default,
        limitLength.default,
        pattern.default,
        limitProperties.default,
        required$1.default,
        limitItems.default,
        uniqueItems.default,
        {
            keyword: "type",
            schemaType: [
                "string",
                "array"
            ]
        },
        {
            keyword: "nullable",
            schemaType: "boolean"
        },
        _const.default,
        _enum.default
    ];
    exports.default = validation;
});
var additionalItems = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.validateAdditionalItems = void 0;
    const error = {
        message: ({ params: { len  }  })=>codegen.str`must NOT have more than ${len} items`
        ,
        params: ({ params: { len  }  })=>codegen._`{limit: ${len}}`
    };
    const def = {
        keyword: "additionalItems",
        type: "array",
        schemaType: [
            "boolean",
            "object"
        ],
        before: "uniqueItems",
        error,
        code (cxt) {
            const { parentSchema , it  } = cxt;
            const { items: items2  } = parentSchema;
            if (!Array.isArray(items2)) {
                util.checkStrictMode(it, '"additionalItems" is ignored when "items" is not an array of schemas');
                return;
            }
            validateAdditionalItems(cxt, items2);
        }
    };
    function validateAdditionalItems(cxt, items2) {
        const { gen , schema , data , keyword: keyword2 , it  } = cxt;
        it.items = true;
        const len = gen.const("len", codegen._`${data}.length`);
        if (schema === false) {
            cxt.setParams({
                len: items2.length
            });
            cxt.pass(codegen._`${len} <= ${items2.length}`);
        } else if (typeof schema == "object" && !util.alwaysValidSchema(it, schema)) {
            const valid = gen.var("valid", codegen._`${len} <= ${items2.length}`);
            gen.if(codegen.not(valid), ()=>validateItems(valid)
            );
            cxt.ok(valid);
        }
        function validateItems(valid) {
            gen.forRange("i", items2.length, len, (i)=>{
                cxt.subschema({
                    keyword: keyword2,
                    dataProp: i,
                    dataPropType: util.Type.Num
                }, valid);
                if (!it.allErrors) gen.if(codegen.not(valid), ()=>gen.break()
                );
            });
        }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
});
var items1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.validateTuple = void 0;
    const def = {
        keyword: "items",
        type: "array",
        schemaType: [
            "object",
            "array",
            "boolean"
        ],
        before: "uniqueItems",
        code (cxt) {
            const { schema , it  } = cxt;
            if (Array.isArray(schema)) return validateTuple(cxt, "additionalItems", schema);
            it.items = true;
            if (util.alwaysValidSchema(it, schema)) return;
            cxt.ok(code$1.validateArray(cxt));
        }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
        const { gen , parentSchema , data , keyword: keyword2 , it  } = cxt;
        checkStrictTuple(parentSchema);
        if (it.opts.unevaluated && schArr.length && it.items !== true) {
            it.items = util.mergeEvaluated.items(gen, schArr.length, it.items);
        }
        const valid = gen.name("valid");
        const len = gen.const("len", codegen._`${data}.length`);
        schArr.forEach((sch, i)=>{
            if (util.alwaysValidSchema(it, sch)) return;
            gen.if(codegen._`${len} > ${i}`, ()=>cxt.subschema({
                    keyword: keyword2,
                    schemaProp: i,
                    dataProp: i
                }, valid)
            );
            cxt.ok(valid);
        });
        function checkStrictTuple(sch) {
            const { opts , errSchemaPath  } = it;
            const l = schArr.length;
            const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
            if (opts.strictTuples && !fullTuple) {
                const msg = `"${keyword2}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
                util.checkStrictMode(it, msg, opts.strictTuples);
            }
        }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
});
var prefixItems = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const def = {
        keyword: "prefixItems",
        type: "array",
        schemaType: [
            "array"
        ],
        before: "uniqueItems",
        code: (cxt)=>items1.validateTuple(cxt, "items")
    };
    exports.default = def;
});
var items2020 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ params: { len  }  })=>codegen.str`must NOT have more than ${len} items`
        ,
        params: ({ params: { len  }  })=>codegen._`{limit: ${len}}`
    };
    const def = {
        keyword: "items",
        type: "array",
        schemaType: [
            "object",
            "boolean"
        ],
        before: "uniqueItems",
        error,
        code (cxt) {
            const { schema , parentSchema , it  } = cxt;
            const { prefixItems: prefixItems2  } = parentSchema;
            it.items = true;
            if (util.alwaysValidSchema(it, schema)) return;
            if (prefixItems2) additionalItems.validateAdditionalItems(cxt, prefixItems2);
            else cxt.ok(code$1.validateArray(cxt));
        }
    };
    exports.default = def;
});
var contains = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ params: { min , max  }  })=>max === void 0 ? codegen.str`must contain at least ${min} valid item(s)` : codegen.str`must contain at least ${min} and no more than ${max} valid item(s)`
        ,
        params: ({ params: { min , max  }  })=>max === void 0 ? codegen._`{minContains: ${min}}` : codegen._`{minContains: ${min}, maxContains: ${max}}`
    };
    const def = {
        keyword: "contains",
        type: "array",
        schemaType: [
            "object",
            "boolean"
        ],
        before: "uniqueItems",
        trackErrors: true,
        error,
        code (cxt) {
            const { gen , schema , parentSchema , data , it  } = cxt;
            let min;
            let max;
            const { minContains , maxContains  } = parentSchema;
            if (it.opts.next) {
                min = minContains === void 0 ? 1 : minContains;
                max = maxContains;
            } else {
                min = 1;
            }
            const len = gen.const("len", codegen._`${data}.length`);
            cxt.setParams({
                min,
                max
            });
            if (max === void 0 && min === 0) {
                util.checkStrictMode(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
                return;
            }
            if (max !== void 0 && min > max) {
                util.checkStrictMode(it, `"minContains" > "maxContains" is always invalid`);
                cxt.fail();
                return;
            }
            if (util.alwaysValidSchema(it, schema)) {
                let cond = codegen._`${len} >= ${min}`;
                if (max !== void 0) cond = codegen._`${cond} && ${len} <= ${max}`;
                cxt.pass(cond);
                return;
            }
            it.items = true;
            const valid = gen.name("valid");
            if (max === void 0 && min === 1) {
                validateItems(valid, ()=>gen.if(valid, ()=>gen.break()
                    )
                );
            } else {
                gen.let(valid, false);
                const schValid = gen.name("_valid");
                const count = gen.let("count", 0);
                validateItems(schValid, ()=>gen.if(schValid, ()=>checkLimits(count)
                    )
                );
            }
            cxt.result(valid, ()=>cxt.reset()
            );
            function validateItems(_valid, block) {
                gen.forRange("i", 0, len, (i)=>{
                    cxt.subschema({
                        keyword: "contains",
                        dataProp: i,
                        dataPropType: util.Type.Num,
                        compositeRule: true
                    }, _valid);
                    block();
                });
            }
            function checkLimits(count) {
                gen.code(codegen._`${count}++`);
                if (max === void 0) {
                    gen.if(codegen._`${count} >= ${min}`, ()=>gen.assign(valid, true).break()
                    );
                } else {
                    gen.if(codegen._`${count} > ${max}`, ()=>gen.assign(valid, false).break()
                    );
                    if (min === 1) gen.assign(valid, true);
                    else gen.if(codegen._`${count} >= ${min}`, ()=>gen.assign(valid, true)
                    );
                }
            }
        }
    };
    exports.default = def;
});
var dependencies = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    exports.error = {
        message: ({ params: { property , depsCount , deps  }  })=>{
            const property_ies = depsCount === 1 ? "property" : "properties";
            return codegen.str`must have ${property_ies} ${deps} when property ${property} is present`;
        },
        params: ({ params: { property , depsCount , deps , missingProperty  }  })=>codegen._`{property: ${property},\n    missingProperty: ${missingProperty},\n    depsCount: ${depsCount},\n    deps: ${deps}}`
    };
    const def = {
        keyword: "dependencies",
        type: "object",
        schemaType: "object",
        error: exports.error,
        code (cxt) {
            const [propDeps, schDeps] = splitDependencies(cxt);
            validatePropertyDeps(cxt, propDeps);
            validateSchemaDeps(cxt, schDeps);
        }
    };
    function splitDependencies({ schema  }) {
        const propertyDeps = {
        };
        const schemaDeps = {
        };
        for(const key in schema){
            if (key === "__proto__") continue;
            const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
            deps[key] = schema[key];
        }
        return [
            propertyDeps,
            schemaDeps
        ];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
        const { gen , data , it  } = cxt;
        if (Object.keys(propertyDeps).length === 0) return;
        const missing = gen.let("missing");
        for(const prop in propertyDeps){
            const deps = propertyDeps[prop];
            if (deps.length === 0) continue;
            const hasProperty = code$1.propertyInData(gen, data, prop, it.opts.ownProperties);
            cxt.setParams({
                property: prop,
                depsCount: deps.length,
                deps: deps.join(", ")
            });
            if (it.allErrors) {
                gen.if(hasProperty, ()=>{
                    for (const depProp of deps){
                        code$1.checkReportMissingProp(cxt, depProp);
                    }
                });
            } else {
                gen.if(codegen._`${hasProperty} && (${code$1.checkMissingProp(cxt, deps, missing)})`);
                code$1.reportMissingProp(cxt, missing);
                gen.else();
            }
        }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
        const { gen , data , keyword: keyword2 , it  } = cxt;
        const valid = gen.name("valid");
        for(const prop in schemaDeps){
            if (util.alwaysValidSchema(it, schemaDeps[prop])) continue;
            gen.if(code$1.propertyInData(gen, data, prop, it.opts.ownProperties), ()=>{
                const schCxt = cxt.subschema({
                    keyword: keyword2,
                    schemaProp: prop
                }, valid);
                cxt.mergeValidEvaluated(schCxt, valid);
            }, ()=>gen.var(valid, true)
            );
            cxt.ok(valid);
        }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
});
var propertyNames = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: "property name must be valid",
        params: ({ params  })=>codegen._`{propertyName: ${params.propertyName}}`
    };
    const def = {
        keyword: "propertyNames",
        type: "object",
        schemaType: [
            "object",
            "boolean"
        ],
        error,
        code (cxt) {
            const { gen , schema , data , it  } = cxt;
            if (util.alwaysValidSchema(it, schema)) return;
            const valid = gen.name("valid");
            gen.forIn("key", data, (key)=>{
                cxt.setParams({
                    propertyName: key
                });
                cxt.subschema({
                    keyword: "propertyNames",
                    data: key,
                    dataTypes: [
                        "string"
                    ],
                    propertyName: key,
                    compositeRule: true
                }, valid);
                gen.if(codegen.not(valid), ()=>{
                    cxt.error(true);
                    if (!it.allErrors) gen.break();
                });
            });
            cxt.ok(valid);
        }
    };
    exports.default = def;
});
var additionalProperties$1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: "must NOT have additional properties",
        params: ({ params  })=>codegen._`{additionalProperty: ${params.additionalProperty}}`
    };
    const def = {
        keyword: "additionalProperties",
        type: [
            "object"
        ],
        schemaType: [
            "boolean",
            "object"
        ],
        allowUndefined: true,
        trackErrors: true,
        error,
        code (cxt) {
            const { gen , schema , parentSchema , data , errsCount , it  } = cxt;
            if (!errsCount) throw new Error("ajv implementation error");
            const { allErrors , opts  } = it;
            it.props = true;
            if (opts.removeAdditional !== "all" && util.alwaysValidSchema(it, schema)) return;
            const props = code$1.allSchemaProperties(parentSchema.properties);
            const patProps = code$1.allSchemaProperties(parentSchema.patternProperties);
            checkAdditionalProperties();
            cxt.ok(codegen._`${errsCount} === ${names_1.default.errors}`);
            function checkAdditionalProperties() {
                gen.forIn("key", data, (key)=>{
                    if (!props.length && !patProps.length) additionalPropertyCode(key);
                    else gen.if(isAdditional(key), ()=>additionalPropertyCode(key)
                    );
                });
            }
            function isAdditional(key) {
                let definedProp;
                if (props.length > 8) {
                    const propsSchema = util.schemaRefOrVal(it, parentSchema.properties, "properties");
                    definedProp = code$1.isOwnProperty(gen, propsSchema, key);
                } else if (props.length) {
                    definedProp = codegen.or(...props.map((p)=>codegen._`${key} === ${p}`
                    ));
                } else {
                    definedProp = codegen.nil;
                }
                if (patProps.length) {
                    definedProp = codegen.or(definedProp, ...patProps.map((p)=>codegen._`${code$1.usePattern(cxt, p)}.test(${key})`
                    ));
                }
                return codegen.not(definedProp);
            }
            function deleteAdditional(key) {
                gen.code(codegen._`delete ${data}[${key}]`);
            }
            function additionalPropertyCode(key) {
                if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
                    deleteAdditional(key);
                    return;
                }
                if (schema === false) {
                    cxt.setParams({
                        additionalProperty: key
                    });
                    cxt.error();
                    if (!allErrors) gen.break();
                    return;
                }
                if (typeof schema == "object" && !util.alwaysValidSchema(it, schema)) {
                    const valid = gen.name("valid");
                    if (opts.removeAdditional === "failing") {
                        applyAdditionalSchema(key, valid, false);
                        gen.if(codegen.not(valid), ()=>{
                            cxt.reset();
                            deleteAdditional(key);
                        });
                    } else {
                        applyAdditionalSchema(key, valid);
                        if (!allErrors) gen.if(codegen.not(valid), ()=>gen.break()
                        );
                    }
                }
            }
            function applyAdditionalSchema(key, valid, errors2) {
                const subschema2 = {
                    keyword: "additionalProperties",
                    dataProp: key,
                    dataPropType: util.Type.Str
                };
                if (errors2 === false) {
                    Object.assign(subschema2, {
                        compositeRule: true,
                        createErrors: false,
                        allErrors: false
                    });
                }
                cxt.subschema(subschema2, valid);
            }
        }
    };
    exports.default = def;
});
var properties$1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const def = {
        keyword: "properties",
        type: "object",
        schemaType: "object",
        code (cxt) {
            const { gen , schema , parentSchema , data , it  } = cxt;
            if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
                additionalProperties$1.default.code(new validate.KeywordCxt(it, additionalProperties$1.default, "additionalProperties"));
            }
            const allProps = code$1.allSchemaProperties(schema);
            for (const prop of allProps){
                it.definedProperties.add(prop);
            }
            if (it.opts.unevaluated && allProps.length && it.props !== true) {
                it.props = util.mergeEvaluated.props(gen, util.toHash(allProps), it.props);
            }
            const properties2 = allProps.filter((p)=>!util.alwaysValidSchema(it, schema[p])
            );
            if (properties2.length === 0) return;
            const valid = gen.name("valid");
            for (const prop1 of properties2){
                if (hasDefault(prop1)) {
                    applyPropertySchema(prop1);
                } else {
                    gen.if(code$1.propertyInData(gen, data, prop1, it.opts.ownProperties));
                    applyPropertySchema(prop1);
                    if (!it.allErrors) gen.else().var(valid, true);
                    gen.endIf();
                }
                cxt.it.definedProperties.add(prop1);
                cxt.ok(valid);
            }
            function hasDefault(prop2) {
                return it.opts.useDefaults && !it.compositeRule && schema[prop2].default !== void 0;
            }
            function applyPropertySchema(prop2) {
                cxt.subschema({
                    keyword: "properties",
                    schemaProp: prop2,
                    dataProp: prop2
                }, valid);
            }
        }
    };
    exports.default = def;
});
var patternProperties = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const util_2 = util;
    const def = {
        keyword: "patternProperties",
        type: "object",
        schemaType: "object",
        code (cxt) {
            const { gen , schema , data , parentSchema , it  } = cxt;
            const { opts  } = it;
            const patterns = code$1.schemaProperties(it, schema);
            if (patterns.length === 0) return;
            const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
            const valid = gen.name("valid");
            if (it.props !== true && !(it.props instanceof codegen.Name)) {
                it.props = util_2.evaluatedPropsToName(gen, it.props);
            }
            const { props  } = it;
            validatePatternProperties();
            function validatePatternProperties() {
                for (const pat of patterns){
                    if (checkProperties) checkMatchingProperties(pat);
                    if (it.allErrors) {
                        validateProperties(pat);
                    } else {
                        gen.var(valid, true);
                        validateProperties(pat);
                        gen.if(valid);
                    }
                }
            }
            function checkMatchingProperties(pat) {
                for(const prop in checkProperties){
                    if (new RegExp(pat).test(prop)) {
                        util.checkStrictMode(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
                    }
                }
            }
            function validateProperties(pat) {
                gen.forIn("key", data, (key)=>{
                    gen.if(codegen._`${code$1.usePattern(cxt, pat)}.test(${key})`, ()=>{
                        cxt.subschema({
                            keyword: "patternProperties",
                            schemaProp: pat,
                            dataProp: key,
                            dataPropType: util_2.Type.Str
                        }, valid);
                        if (it.opts.unevaluated && props !== true) {
                            gen.assign(codegen._`${props}[${key}]`, true);
                        } else if (!it.allErrors) {
                            gen.if(codegen.not(valid), ()=>gen.break()
                            );
                        }
                    });
                });
            }
        }
    };
    exports.default = def;
});
var not1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const def = {
        keyword: "not",
        schemaType: [
            "object",
            "boolean"
        ],
        trackErrors: true,
        code (cxt) {
            const { gen , schema , it  } = cxt;
            if (util.alwaysValidSchema(it, schema)) {
                cxt.fail();
                return;
            }
            const valid = gen.name("valid");
            cxt.subschema({
                keyword: "not",
                compositeRule: true,
                createErrors: false,
                allErrors: false
            }, valid);
            cxt.result(valid, ()=>cxt.error()
            , ()=>cxt.reset()
            );
        },
        error: {
            message: "must NOT be valid"
        }
    };
    exports.default = def;
});
var anyOf = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const def = {
        keyword: "anyOf",
        schemaType: "array",
        trackErrors: true,
        code: code$1.validateUnion,
        error: {
            message: "must match a schema in anyOf"
        }
    };
    exports.default = def;
});
var oneOf = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: "must match exactly one schema in oneOf",
        params: ({ params  })=>codegen._`{passingSchemas: ${params.passing}}`
    };
    const def = {
        keyword: "oneOf",
        schemaType: "array",
        trackErrors: true,
        error,
        code (cxt) {
            const { gen , schema , parentSchema , it  } = cxt;
            if (!Array.isArray(schema)) throw new Error("ajv implementation error");
            if (it.opts.discriminator && parentSchema.discriminator) return;
            const schArr = schema;
            const valid = gen.let("valid", false);
            const passing = gen.let("passing", null);
            const schValid = gen.name("_valid");
            cxt.setParams({
                passing
            });
            gen.block(validateOneOf);
            cxt.result(valid, ()=>cxt.reset()
            , ()=>cxt.error(true)
            );
            function validateOneOf() {
                schArr.forEach((sch, i)=>{
                    let schCxt;
                    if (util.alwaysValidSchema(it, sch)) {
                        gen.var(schValid, true);
                    } else {
                        schCxt = cxt.subschema({
                            keyword: "oneOf",
                            schemaProp: i,
                            compositeRule: true
                        }, schValid);
                    }
                    if (i > 0) {
                        gen.if(codegen._`${schValid} && ${valid}`).assign(valid, false).assign(passing, codegen._`[${passing}, ${i}]`).else();
                    }
                    gen.if(schValid, ()=>{
                        gen.assign(valid, true);
                        gen.assign(passing, i);
                        if (schCxt) cxt.mergeEvaluated(schCxt, codegen.Name);
                    });
                });
            }
        }
    };
    exports.default = def;
});
var allOf = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const def = {
        keyword: "allOf",
        schemaType: "array",
        code (cxt) {
            const { gen , schema , it  } = cxt;
            if (!Array.isArray(schema)) throw new Error("ajv implementation error");
            const valid = gen.name("valid");
            schema.forEach((sch, i)=>{
                if (util.alwaysValidSchema(it, sch)) return;
                const schCxt = cxt.subschema({
                    keyword: "allOf",
                    schemaProp: i
                }, valid);
                cxt.ok(valid);
                cxt.mergeEvaluated(schCxt);
            });
        }
    };
    exports.default = def;
});
var _if = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ params  })=>codegen.str`must match "${params.ifClause}" schema`
        ,
        params: ({ params  })=>codegen._`{failingKeyword: ${params.ifClause}}`
    };
    const def = {
        keyword: "if",
        schemaType: [
            "object",
            "boolean"
        ],
        trackErrors: true,
        error,
        code (cxt) {
            const { gen , parentSchema , it  } = cxt;
            if (parentSchema.then === void 0 && parentSchema.else === void 0) {
                util.checkStrictMode(it, '"if" without "then" and "else" is ignored');
            }
            const hasThen = hasSchema(it, "then");
            const hasElse = hasSchema(it, "else");
            if (!hasThen && !hasElse) return;
            const valid = gen.let("valid", true);
            const schValid = gen.name("_valid");
            validateIf();
            cxt.reset();
            if (hasThen && hasElse) {
                const ifClause = gen.let("ifClause");
                cxt.setParams({
                    ifClause
                });
                gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
            } else if (hasThen) {
                gen.if(schValid, validateClause("then"));
            } else {
                gen.if(codegen.not(schValid), validateClause("else"));
            }
            cxt.pass(valid, ()=>cxt.error(true)
            );
            function validateIf() {
                const schCxt = cxt.subschema({
                    keyword: "if",
                    compositeRule: true,
                    createErrors: false,
                    allErrors: false
                }, schValid);
                cxt.mergeEvaluated(schCxt);
            }
            function validateClause(keyword2, ifClause) {
                return ()=>{
                    const schCxt = cxt.subschema({
                        keyword: keyword2
                    }, schValid);
                    gen.assign(valid, schValid);
                    cxt.mergeValidEvaluated(schCxt, valid);
                    if (ifClause) gen.assign(ifClause, codegen._`${keyword2}`);
                    else cxt.setParams({
                        ifClause: keyword2
                    });
                };
            }
        }
    };
    function hasSchema(it, keyword2) {
        const schema = it.schema[keyword2];
        return schema !== void 0 && !util.alwaysValidSchema(it, schema);
    }
    exports.default = def;
});
var thenElse = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const def = {
        keyword: [
            "then",
            "else"
        ],
        schemaType: [
            "object",
            "boolean"
        ],
        code ({ keyword: keyword2 , parentSchema , it  }) {
            if (parentSchema.if === void 0) util.checkStrictMode(it, `"${keyword2}" without "if" is ignored`);
        }
    };
    exports.default = def;
});
var applicator = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    function getApplicator(draft2020 = false) {
        const applicator2 = [
            not1.default,
            anyOf.default,
            oneOf.default,
            allOf.default,
            _if.default,
            thenElse.default,
            propertyNames.default,
            additionalProperties$1.default,
            dependencies.default,
            properties$1.default,
            patternProperties.default
        ];
        if (draft2020) applicator2.push(prefixItems.default, items2020.default);
        else applicator2.push(additionalItems.default, items1.default);
        applicator2.push(contains.default);
        return applicator2;
    }
    exports.default = getApplicator;
});
var format1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ schemaCode  })=>codegen.str`must match format "${schemaCode}"`
        ,
        params: ({ schemaCode  })=>codegen._`{format: ${schemaCode}}`
    };
    const def = {
        keyword: "format",
        type: [
            "number",
            "string"
        ],
        schemaType: "string",
        $data: true,
        error,
        code (cxt, ruleType) {
            const { gen , data , $data , schema , schemaCode , it  } = cxt;
            const { opts , errSchemaPath , schemaEnv , self  } = it;
            if (!opts.validateFormats) return;
            if ($data) validate$DataFormat();
            else validateFormat();
            function validate$DataFormat() {
                const fmts = gen.scopeValue("formats", {
                    ref: self.formats,
                    code: opts.code.formats
                });
                const fDef = gen.const("fDef", codegen._`${fmts}[${schemaCode}]`);
                const fType = gen.let("fType");
                const format2 = gen.let("format");
                gen.if(codegen._`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, ()=>gen.assign(fType, codegen._`${fDef}.type || "string"`).assign(format2, codegen._`${fDef}.validate`)
                , ()=>gen.assign(fType, codegen._`"string"`).assign(format2, fDef)
                );
                cxt.fail$data(codegen.or(unknownFmt(), invalidFmt()));
                function unknownFmt() {
                    if (opts.strictSchema === false) return codegen.nil;
                    return codegen._`${schemaCode} && !${format2}`;
                }
                function invalidFmt() {
                    const callFormat = schemaEnv.$async ? codegen._`(${fDef}.async ? await ${format2}(${data}) : ${format2}(${data}))` : codegen._`${format2}(${data})`;
                    const validData = codegen._`(typeof ${format2} == "function" ? ${callFormat} : ${format2}.test(${data}))`;
                    return codegen._`${format2} && ${format2} !== true && ${fType} === ${ruleType} && !${validData}`;
                }
            }
            function validateFormat() {
                const formatDef = self.formats[schema];
                if (!formatDef) {
                    unknownFormat();
                    return;
                }
                if (formatDef === true) return;
                const [fmtType, format2, fmtRef] = getFormat(formatDef);
                if (fmtType === ruleType) cxt.pass(validCondition());
                function unknownFormat() {
                    if (opts.strictSchema === false) {
                        self.logger.warn(unknownMsg());
                        return;
                    }
                    throw new Error(unknownMsg());
                    function unknownMsg() {
                        return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
                    }
                }
                function getFormat(fmtDef) {
                    const code2 = fmtDef instanceof RegExp ? codegen.regexpCode(fmtDef) : opts.code.formats ? codegen._`${opts.code.formats}${codegen.getProperty(schema)}` : void 0;
                    const fmt = gen.scopeValue("formats", {
                        key: schema,
                        ref: fmtDef,
                        code: code2
                    });
                    if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
                        return [
                            fmtDef.type || "string",
                            fmtDef.validate,
                            codegen._`${fmt}.validate`
                        ];
                    }
                    return [
                        "string",
                        fmtDef,
                        fmt
                    ];
                }
                function validCondition() {
                    if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
                        if (!schemaEnv.$async) throw new Error("async format in sync schema");
                        return codegen._`await ${fmtRef}(${data})`;
                    }
                    return typeof format2 == "function" ? codegen._`${fmtRef}(${data})` : codegen._`${fmtRef}.test(${data})`;
                }
            }
        }
    };
    exports.default = def;
});
var format_2 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const format$1 = [
        format1.default
    ];
    exports.default = format$1;
});
var metadata2 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
        "title",
        "description",
        "default",
        "deprecated",
        "readOnly",
        "writeOnly",
        "examples"
    ];
    exports.contentVocabulary = [
        "contentMediaType",
        "contentEncoding",
        "contentSchema"
    ];
});
var draft7 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const draft7Vocabularies = [
        core_1.default,
        validation_1.default,
        applicator.default(),
        format_2.default,
        metadata2.metadataVocabulary,
        metadata2.contentVocabulary
    ];
    exports.default = draft7Vocabularies;
});
var types = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.DiscrError = void 0;
    (function(DiscrError) {
        DiscrError["Tag"] = "tag";
        DiscrError["Mapping"] = "mapping";
    })(exports.DiscrError || (exports.DiscrError = {
    }));
});
var discriminator1 = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const error = {
        message: ({ params: { discrError , tagName  }  })=>discrError === types.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`
        ,
        params: ({ params: { discrError , tag , tagName  }  })=>codegen._`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    const def = {
        keyword: "discriminator",
        type: "object",
        schemaType: "object",
        error,
        code (cxt) {
            const { gen , data , schema , parentSchema , it  } = cxt;
            const { oneOf: oneOf2  } = parentSchema;
            if (!it.opts.discriminator) {
                throw new Error("discriminator: requires discriminator option");
            }
            const tagName = schema.propertyName;
            if (typeof tagName != "string") throw new Error("discriminator: requires propertyName");
            if (schema.mapping) throw new Error("discriminator: mapping is not supported");
            if (!oneOf2) throw new Error("discriminator: requires oneOf keyword");
            const valid = gen.let("valid", false);
            const tag = gen.const("tag", codegen._`${data}${codegen.getProperty(tagName)}`);
            gen.if(codegen._`typeof ${tag} == "string"`, ()=>validateMapping()
            , ()=>cxt.error(false, {
                    discrError: types.DiscrError.Tag,
                    tag,
                    tagName
                })
            );
            cxt.ok(valid);
            function validateMapping() {
                const mapping = getMapping();
                gen.if(false);
                for(const tagValue in mapping){
                    gen.elseIf(codegen._`${tag} === ${tagValue}`);
                    gen.assign(valid, applyTagSchema(mapping[tagValue]));
                }
                gen.else();
                cxt.error(false, {
                    discrError: types.DiscrError.Mapping,
                    tag,
                    tagName
                });
                gen.endIf();
            }
            function applyTagSchema(schemaProp) {
                const _valid = gen.name("valid");
                const schCxt = cxt.subschema({
                    keyword: "oneOf",
                    schemaProp
                }, _valid);
                cxt.mergeEvaluated(schCxt, codegen.Name);
                return _valid;
            }
            function getMapping() {
                var _a;
                const oneOfMapping = {
                };
                const topRequired = hasRequired(parentSchema);
                let tagRequired = true;
                for(let i = 0; i < oneOf2.length; i++){
                    const sch = oneOf2[i];
                    const propSch = (_a = sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
                    if (typeof propSch != "object") {
                        throw new Error(`discriminator: oneOf schemas must have "properties/${tagName}"`);
                    }
                    tagRequired = tagRequired && (topRequired || hasRequired(sch));
                    addMappings(propSch, i);
                }
                if (!tagRequired) throw new Error(`discriminator: "${tagName}" must be required`);
                return oneOfMapping;
                function hasRequired({ required: required2  }) {
                    return Array.isArray(required2) && required2.includes(tagName);
                }
                function addMappings(sch, i1) {
                    if (sch.const) {
                        addMapping(sch.const, i1);
                    } else if (sch.enum) {
                        for (const tagValue of sch.enum){
                            addMapping(tagValue, i1);
                        }
                    } else {
                        throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
                    }
                }
                function addMapping(tagValue, i1) {
                    if (typeof tagValue != "string" || tagValue in oneOfMapping) {
                        throw new Error(`discriminator: "${tagName}" values must be unique strings`);
                    }
                    oneOfMapping[tagValue] = i1;
                }
            }
        }
    };
    exports.default = def;
});
const $schema = "http://json-schema.org/draft-07/schema#";
const $id$1 = "http://json-schema.org/draft-07/schema#";
const title = "Core schema meta-schema";
const definitions = {
    schemaArray: {
        type: "array",
        minItems: 1,
        items: {
            $ref: "#"
        }
    },
    nonNegativeInteger: {
        type: "integer",
        minimum: 0
    },
    nonNegativeIntegerDefault0: {
        allOf: [
            {
                $ref: "#/definitions/nonNegativeInteger"
            },
            {
                default: 0
            }
        ]
    },
    simpleTypes: {
        enum: [
            "array",
            "boolean",
            "integer",
            "null",
            "number",
            "object",
            "string"
        ]
    },
    stringArray: {
        type: "array",
        items: {
            type: "string"
        },
        uniqueItems: true,
        default: []
    }
};
const type$1 = [
    "object",
    "boolean"
];
const properties$2 = {
    $id: {
        type: "string",
        format: "uri-reference"
    },
    $schema: {
        type: "string",
        format: "uri"
    },
    $ref: {
        type: "string",
        format: "uri-reference"
    },
    $comment: {
        type: "string"
    },
    title: {
        type: "string"
    },
    description: {
        type: "string"
    },
    default: true,
    readOnly: {
        type: "boolean",
        default: false
    },
    examples: {
        type: "array",
        items: true
    },
    multipleOf: {
        type: "number",
        exclusiveMinimum: 0
    },
    maximum: {
        type: "number"
    },
    exclusiveMaximum: {
        type: "number"
    },
    minimum: {
        type: "number"
    },
    exclusiveMinimum: {
        type: "number"
    },
    maxLength: {
        $ref: "#/definitions/nonNegativeInteger"
    },
    minLength: {
        $ref: "#/definitions/nonNegativeIntegerDefault0"
    },
    pattern: {
        type: "string",
        format: "regex"
    },
    additionalItems: {
        $ref: "#"
    },
    items: {
        anyOf: [
            {
                $ref: "#"
            },
            {
                $ref: "#/definitions/schemaArray"
            }
        ],
        default: true
    },
    maxItems: {
        $ref: "#/definitions/nonNegativeInteger"
    },
    minItems: {
        $ref: "#/definitions/nonNegativeIntegerDefault0"
    },
    uniqueItems: {
        type: "boolean",
        default: false
    },
    contains: {
        $ref: "#"
    },
    maxProperties: {
        $ref: "#/definitions/nonNegativeInteger"
    },
    minProperties: {
        $ref: "#/definitions/nonNegativeIntegerDefault0"
    },
    required: {
        $ref: "#/definitions/stringArray"
    },
    additionalProperties: {
        $ref: "#"
    },
    definitions: {
        type: "object",
        additionalProperties: {
            $ref: "#"
        },
        default: {
        }
    },
    properties: {
        type: "object",
        additionalProperties: {
            $ref: "#"
        },
        default: {
        }
    },
    patternProperties: {
        type: "object",
        additionalProperties: {
            $ref: "#"
        },
        propertyNames: {
            format: "regex"
        },
        default: {
        }
    },
    dependencies: {
        type: "object",
        additionalProperties: {
            anyOf: [
                {
                    $ref: "#"
                },
                {
                    $ref: "#/definitions/stringArray"
                }
            ]
        }
    },
    propertyNames: {
        $ref: "#"
    },
    const: true,
    enum: {
        type: "array",
        items: true,
        minItems: 1,
        uniqueItems: true
    },
    type: {
        anyOf: [
            {
                $ref: "#/definitions/simpleTypes"
            },
            {
                type: "array",
                items: {
                    $ref: "#/definitions/simpleTypes"
                },
                minItems: 1,
                uniqueItems: true
            }
        ]
    },
    format: {
        type: "string"
    },
    contentMediaType: {
        type: "string"
    },
    contentEncoding: {
        type: "string"
    },
    if: {
        $ref: "#"
    },
    then: {
        $ref: "#"
    },
    else: {
        $ref: "#"
    },
    allOf: {
        $ref: "#/definitions/schemaArray"
    },
    anyOf: {
        $ref: "#/definitions/schemaArray"
    },
    oneOf: {
        $ref: "#/definitions/schemaArray"
    },
    not: {
        $ref: "#"
    }
};
var draft7MetaSchema = {
    $schema,
    $id: $id$1,
    title,
    definitions,
    type: type$1,
    properties: properties$2,
    default: true
};
var ajv = createCommonjsModule2(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    const META_SUPPORT_DATA = [
        "/properties"
    ];
    const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    class Ajv extends core.default {
        _addVocabularies() {
            super._addVocabularies();
            draft7.default.forEach((v)=>this.addVocabulary(v)
            );
            if (this.opts.discriminator) this.addKeyword(discriminator1.default);
        }
        _addDefaultMetaSchema() {
            super._addDefaultMetaSchema();
            if (!this.opts.meta) return;
            const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
            this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
            this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
        }
        defaultMeta() {
            return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
        }
    }
    module.exports = exports = Ajv;
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.default = Ajv;
    Object.defineProperty(exports, "KeywordCxt", {
        enumerable: true,
        get: function() {
            return validate.KeywordCxt;
        }
    });
    Object.defineProperty(exports, "_", {
        enumerable: true,
        get: function() {
            return codegen._;
        }
    });
    Object.defineProperty(exports, "str", {
        enumerable: true,
        get: function() {
            return codegen.str;
        }
    });
    Object.defineProperty(exports, "stringify", {
        enumerable: true,
        get: function() {
            return codegen.stringify;
        }
    });
    Object.defineProperty(exports, "nil", {
        enumerable: true,
        get: function() {
            return codegen.nil;
        }
    });
    Object.defineProperty(exports, "Name", {
        enumerable: true,
        get: function() {
            return codegen.Name;
        }
    });
    Object.defineProperty(exports, "CodeGen", {
        enumerable: true,
        get: function() {
            return codegen.CodeGen;
        }
    });
});
var __pika_web_default_export_for_treeshaking__1 = getDefaultExportFromCjs1(ajv);
function getDefaultExportFromCjs2(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function createCommonjsModule3(fn) {
    var module = {
        exports: {
        }
    };
    return fn(module, module.exports), module.exports;
}
var __VIRTUAL_FILE = createCommonjsModule3(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.regexpCode = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    class _CodeOrName {
    }
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    class Name extends _CodeOrName {
        constructor(s){
            super();
            if (!exports.IDENTIFIER.test(s)) throw new Error("CodeGen: name must be a valid identifier");
            this.str = s;
        }
        toString() {
            return this.str;
        }
        emptyStr() {
            return false;
        }
        get names() {
            return {
                [this.str]: 1
            };
        }
    }
    exports.Name = Name;
    class _Code extends _CodeOrName {
        constructor(code1){
            super();
            this._items = typeof code1 === "string" ? [
                code1
            ] : code1;
        }
        toString() {
            return this.str;
        }
        emptyStr() {
            if (this._items.length > 1) return false;
            const item = this._items[0];
            return item === "" || item === '""';
        }
        get str() {
            var _a;
            return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s1, c)=>`${s1}${c}`
            , "");
        }
        get names() {
            var _a;
            return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c)=>{
                if (c instanceof Name) names[c.str] = (names[c.str] || 0) + 1;
                return names;
            }, {
            });
        }
    }
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
        const code2 = [
            strs[0]
        ];
        let i = 0;
        while(i < args.length){
            addCodeArg(code2, args[i]);
            code2.push(strs[++i]);
        }
        return new _Code(code2);
    }
    exports._ = _;
    const plus = new _Code("+");
    function str(strs, ...args) {
        const expr = [
            safeStringify(strs[0])
        ];
        let i = 0;
        while(i < args.length){
            expr.push(plus);
            addCodeArg(expr, args[i]);
            expr.push(plus, safeStringify(strs[++i]));
        }
        optimize(expr);
        return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code2, arg) {
        if (arg instanceof _Code) code2.push(...arg._items);
        else if (arg instanceof Name) code2.push(arg);
        else code2.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
        let i = 1;
        while(i < expr.length - 1){
            if (expr[i] === plus) {
                const res = mergeExprItems(expr[i - 1], expr[i + 1]);
                if (res !== void 0) {
                    expr.splice(i - 1, 3, res);
                    continue;
                }
                expr[i++] = "+";
            }
            i++;
        }
    }
    function mergeExprItems(a, b) {
        if (b === '""') return a;
        if (a === '""') return b;
        if (typeof a == "string") {
            if (b instanceof Name || a[a.length - 1] !== '"') return;
            if (typeof b != "string") return `${a.slice(0, -1)}${b}"`;
            if (b[0] === '"') return a.slice(0, -1) + b.slice(1);
            return;
        }
        if (typeof b == "string" && b[0] === '"' && !(a instanceof Name)) return `"${a}${b.slice(1)}`;
        return;
    }
    function strConcat(c1, c2) {
        return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
        return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
        return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
        return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
        return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function regexpCode(rx) {
        return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
});
var __VIRTUAL_FILE$1 = getDefaultExportFromCjs2(__VIRTUAL_FILE);
function getDefaultExportFromCjs3(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function createCommonjsModule4(fn) {
    var module = {
        exports: {
        }
    };
    return fn(module, module.exports), module.exports;
}
var __VIRTUAL_FILE1 = createCommonjsModule4(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    class ValueError extends Error {
        constructor(name){
            super(`CodeGen: "code" for ${name} not defined`);
            this.value = name.value;
        }
    }
    var UsedValueState;
    (function(UsedValueState2) {
        UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
        UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState = exports.UsedValueState || (exports.UsedValueState = {
    }));
    exports.varKinds = {
        const: new __VIRTUAL_FILE$1.Name("const"),
        let: new __VIRTUAL_FILE$1.Name("let"),
        var: new __VIRTUAL_FILE$1.Name("var")
    };
    class Scope {
        constructor({ prefixes , parent  } = {
        }){
            this._names = {
            };
            this._prefixes = prefixes;
            this._parent = parent;
        }
        toName(nameOrPrefix) {
            return nameOrPrefix instanceof __VIRTUAL_FILE$1.Name ? nameOrPrefix : this.name(nameOrPrefix);
        }
        name(prefix) {
            return new __VIRTUAL_FILE$1.Name(this._newName(prefix));
        }
        _newName(prefix) {
            const ng = this._names[prefix] || this._nameGroup(prefix);
            return `${prefix}${ng.index++}`;
        }
        _nameGroup(prefix) {
            var _a, _b;
            if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
                throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
            }
            return this._names[prefix] = {
                prefix,
                index: 0
            };
        }
    }
    exports.Scope = Scope;
    class ValueScopeName extends __VIRTUAL_FILE$1.Name {
        constructor(prefix1, nameStr){
            super(nameStr);
            this.prefix = prefix1;
        }
        setValue(value, { property , itemIndex  }) {
            this.value = value;
            this.scopePath = __VIRTUAL_FILE$1._`.${new __VIRTUAL_FILE$1.Name(property)}[${itemIndex}]`;
        }
    }
    exports.ValueScopeName = ValueScopeName;
    const line = __VIRTUAL_FILE$1._`\n`;
    class ValueScope extends Scope {
        constructor(opts){
            super(opts);
            this._values = {
            };
            this._scope = opts.scope;
            this.opts = {
                ...opts,
                _n: opts.lines ? line : __VIRTUAL_FILE$1.nil
            };
        }
        get() {
            return this._scope;
        }
        name(prefix) {
            return new ValueScopeName(prefix, this._newName(prefix));
        }
        value(nameOrPrefix, value) {
            var _a;
            if (value.ref === void 0) throw new Error("CodeGen: ref must be passed in value");
            const name1 = this.toName(nameOrPrefix);
            const { prefix: prefix2  } = name1;
            const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
            let vs = this._values[prefix2];
            if (vs) {
                const _name = vs.get(valueKey);
                if (_name) return _name;
            } else {
                vs = this._values[prefix2] = new Map();
            }
            vs.set(valueKey, name1);
            const s = this._scope[prefix2] || (this._scope[prefix2] = []);
            const itemIndex = s.length;
            s[itemIndex] = value.ref;
            name1.setValue(value, {
                property: prefix2,
                itemIndex
            });
            return name1;
        }
        getValue(prefix, keyOrRef) {
            const vs = this._values[prefix];
            if (!vs) return;
            return vs.get(keyOrRef);
        }
        scopeRefs(scopeName, values = this._values) {
            return this._reduceValues(values, (name1)=>{
                if (name1.scopePath === void 0) throw new Error(`CodeGen: name "${name1}" has no value`);
                return __VIRTUAL_FILE$1._`${scopeName}${name1.scopePath}`;
            });
        }
        scopeCode(values = this._values, usedValues, getCode) {
            return this._reduceValues(values, (name1)=>{
                if (name1.value === void 0) throw new Error(`CodeGen: name "${name1}" has no value`);
                return name1.value.code;
            }, usedValues, getCode);
        }
        _reduceValues(values, valueCode, usedValues = {
        }, getCode) {
            let code2 = __VIRTUAL_FILE$1.nil;
            for(const prefix2 in values){
                const vs = values[prefix2];
                if (!vs) continue;
                const nameSet = usedValues[prefix2] = usedValues[prefix2] || new Map();
                vs.forEach((name1)=>{
                    if (nameSet.has(name1)) return;
                    nameSet.set(name1, UsedValueState.Started);
                    let c = valueCode(name1);
                    if (c) {
                        const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
                        code2 = __VIRTUAL_FILE$1._`${code2}${def} ${name1} = ${c};${this.opts._n}`;
                    } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name1)) {
                        code2 = __VIRTUAL_FILE$1._`${code2}${c}${this.opts._n}`;
                    } else {
                        throw new ValueError(name1);
                    }
                    nameSet.set(name1, UsedValueState.Completed);
                });
            }
            return code2;
        }
    }
    exports.ValueScope = ValueScope;
});
var __VIRTUAL_FILE$11 = getDefaultExportFromCjs3(__VIRTUAL_FILE1);
function getDefaultExportFromCjs4(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function createCommonjsModule5(fn) {
    var module = {
        exports: {
        }
    };
    return fn(module, module.exports), module.exports;
}
var __VIRTUAL_FILE2 = createCommonjsModule5(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_2 = __VIRTUAL_FILE$1;
    Object.defineProperty(exports, "_", {
        enumerable: true,
        get: function() {
            return code_2._;
        }
    });
    Object.defineProperty(exports, "str", {
        enumerable: true,
        get: function() {
            return code_2.str;
        }
    });
    Object.defineProperty(exports, "strConcat", {
        enumerable: true,
        get: function() {
            return code_2.strConcat;
        }
    });
    Object.defineProperty(exports, "nil", {
        enumerable: true,
        get: function() {
            return code_2.nil;
        }
    });
    Object.defineProperty(exports, "getProperty", {
        enumerable: true,
        get: function() {
            return code_2.getProperty;
        }
    });
    Object.defineProperty(exports, "stringify", {
        enumerable: true,
        get: function() {
            return code_2.stringify;
        }
    });
    Object.defineProperty(exports, "regexpCode", {
        enumerable: true,
        get: function() {
            return code_2.regexpCode;
        }
    });
    Object.defineProperty(exports, "Name", {
        enumerable: true,
        get: function() {
            return code_2.Name;
        }
    });
    var scope_2 = __VIRTUAL_FILE$11;
    Object.defineProperty(exports, "Scope", {
        enumerable: true,
        get: function() {
            return scope_2.Scope;
        }
    });
    Object.defineProperty(exports, "ValueScope", {
        enumerable: true,
        get: function() {
            return scope_2.ValueScope;
        }
    });
    Object.defineProperty(exports, "ValueScopeName", {
        enumerable: true,
        get: function() {
            return scope_2.ValueScopeName;
        }
    });
    Object.defineProperty(exports, "varKinds", {
        enumerable: true,
        get: function() {
            return scope_2.varKinds;
        }
    });
    exports.operators = {
        GT: new __VIRTUAL_FILE$1._Code(">"),
        GTE: new __VIRTUAL_FILE$1._Code(">="),
        LT: new __VIRTUAL_FILE$1._Code("<"),
        LTE: new __VIRTUAL_FILE$1._Code("<="),
        EQ: new __VIRTUAL_FILE$1._Code("==="),
        NEQ: new __VIRTUAL_FILE$1._Code("!=="),
        NOT: new __VIRTUAL_FILE$1._Code("!"),
        OR: new __VIRTUAL_FILE$1._Code("||"),
        AND: new __VIRTUAL_FILE$1._Code("&&"),
        ADD: new __VIRTUAL_FILE$1._Code("+")
    };
    class Node1 {
        optimizeNodes() {
            return this;
        }
        optimizeNames(_names, _constants) {
            return this;
        }
    }
    class Def extends Node1 {
        constructor(varKind3, name4, rhs3){
            super();
            this.varKind = varKind3;
            this.name = name4;
            this.rhs = rhs3;
        }
        render({ es5 , _n  }) {
            const varKind1 = es5 ? __VIRTUAL_FILE$11.varKinds.var : this.varKind;
            const rhs1 = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
            return `${varKind1} ${this.name}${rhs1};` + _n;
        }
        optimizeNames(names, constants) {
            if (!names[this.name.str]) return;
            if (this.rhs) this.rhs = optimizeExpr(this.rhs, names, constants);
            return this;
        }
        get names() {
            return this.rhs instanceof __VIRTUAL_FILE$1._CodeOrName ? this.rhs.names : {
            };
        }
    }
    class Assign extends Node1 {
        constructor(lhs2, rhs1, sideEffects2){
            super();
            this.lhs = lhs2;
            this.rhs = rhs1;
            this.sideEffects = sideEffects2;
        }
        render({ _n  }) {
            return `${this.lhs} = ${this.rhs};` + _n;
        }
        optimizeNames(names, constants) {
            if (this.lhs instanceof __VIRTUAL_FILE$1.Name && !names[this.lhs.str] && !this.sideEffects) return;
            this.rhs = optimizeExpr(this.rhs, names, constants);
            return this;
        }
        get names() {
            const names = this.lhs instanceof __VIRTUAL_FILE$1.Name ? {
            } : {
                ...this.lhs.names
            };
            return addExprNames(names, this.rhs);
        }
    }
    class AssignOp extends Assign {
        constructor(lhs1, op, rhs2, sideEffects1){
            super(lhs1, rhs2, sideEffects1);
            this.op = op;
        }
        render({ _n  }) {
            return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
        }
    }
    class Label extends Node1 {
        constructor(label2){
            super();
            this.label = label2;
            this.names = {
            };
        }
        render({ _n  }) {
            return `${this.label}:` + _n;
        }
    }
    class Break extends Node1 {
        constructor(label1){
            super();
            this.label = label1;
            this.names = {
            };
        }
        render({ _n  }) {
            const label2 = this.label ? ` ${this.label}` : "";
            return `break${label2};` + _n;
        }
    }
    class Throw extends Node1 {
        constructor(error2){
            super();
            this.error = error2;
        }
        render({ _n  }) {
            return `throw ${this.error};` + _n;
        }
        get names() {
            return this.error.names;
        }
    }
    class AnyCode extends Node1 {
        constructor(code2){
            super();
            this.code = code2;
        }
        render({ _n  }) {
            return `${this.code};` + _n;
        }
        optimizeNodes() {
            return `${this.code}` ? this : void 0;
        }
        optimizeNames(names, constants) {
            this.code = optimizeExpr(this.code, names, constants);
            return this;
        }
        get names() {
            return this.code instanceof __VIRTUAL_FILE$1._CodeOrName ? this.code.names : {
            };
        }
    }
    class ParentNode extends Node1 {
        constructor(nodes = []){
            super();
            this.nodes = nodes;
        }
        render(opts) {
            return this.nodes.reduce((code21, n)=>code21 + n.render(opts)
            , "");
        }
        optimizeNodes() {
            const { nodes: nodes1  } = this;
            let i = nodes1.length;
            while(i--){
                const n = nodes1[i].optimizeNodes();
                if (Array.isArray(n)) nodes1.splice(i, 1, ...n);
                else if (n) nodes1[i] = n;
                else nodes1.splice(i, 1);
            }
            return nodes1.length > 0 ? this : void 0;
        }
        optimizeNames(names, constants) {
            const { nodes: nodes1  } = this;
            let i = nodes1.length;
            while(i--){
                const n = nodes1[i];
                if (n.optimizeNames(names, constants)) continue;
                subtractNames(names, n.names);
                nodes1.splice(i, 1);
            }
            return nodes1.length > 0 ? this : void 0;
        }
        get names() {
            return this.nodes.reduce((names, n)=>addNames(names, n.names)
            , {
            });
        }
    }
    class BlockNode extends ParentNode {
        render(opts) {
            return "{" + opts._n + super.render(opts) + "}" + opts._n;
        }
    }
    class Root extends ParentNode {
    }
    class Else extends BlockNode {
    }
    Else.kind = "else";
    class If extends BlockNode {
        constructor(condition1, nodes1){
            super(nodes1);
            this.condition = condition1;
        }
        render(opts) {
            let code21 = `if(${this.condition})` + super.render(opts);
            if (this.else) code21 += "else " + this.else.render(opts);
            return code21;
        }
        optimizeNodes() {
            super.optimizeNodes();
            const cond = this.condition;
            if (cond === true) return this.nodes;
            let e = this.else;
            if (e) {
                const ns = e.optimizeNodes();
                e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
            }
            if (e) {
                if (cond === false) return e instanceof If ? e : e.nodes;
                if (this.nodes.length) return this;
                return new If(not2(cond), e instanceof If ? [
                    e
                ] : e.nodes);
            }
            if (cond === false || !this.nodes.length) return void 0;
            return this;
        }
        optimizeNames(names, constants) {
            var _a;
            this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
            if (!(super.optimizeNames(names, constants) || this.else)) return;
            this.condition = optimizeExpr(this.condition, names, constants);
            return this;
        }
        get names() {
            const names = super.names;
            addExprNames(names, this.condition);
            if (this.else) addNames(names, this.else.names);
            return names;
        }
    }
    If.kind = "if";
    class For extends BlockNode {
    }
    For.kind = "for";
    class ForLoop extends For {
        constructor(iteration1){
            super();
            this.iteration = iteration1;
        }
        render(opts) {
            return `for(${this.iteration})` + super.render(opts);
        }
        optimizeNames(names, constants) {
            if (!super.optimizeNames(names, constants)) return;
            this.iteration = optimizeExpr(this.iteration, names, constants);
            return this;
        }
        get names() {
            return addNames(super.names, this.iteration.names);
        }
    }
    class ForRange extends For {
        constructor(varKind1, name1, from1, to1){
            super();
            this.varKind = varKind1;
            this.name = name1;
            this.from = from1;
            this.to = to1;
        }
        render(opts) {
            const varKind2 = opts.es5 ? __VIRTUAL_FILE$11.varKinds.var : this.varKind;
            const { name: name2 , from: from1 , to: to1  } = this;
            return `for(${varKind2} ${name2}=${from1}; ${name2}<${to1}; ${name2}++)` + super.render(opts);
        }
        get names() {
            const names = addExprNames(super.names, this.from);
            return addExprNames(names, this.to);
        }
    }
    class ForIter extends For {
        constructor(loop, varKind2, name2, iterable1){
            super();
            this.loop = loop;
            this.varKind = varKind2;
            this.name = name2;
            this.iterable = iterable1;
        }
        render(opts) {
            return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
        }
        optimizeNames(names, constants) {
            if (!super.optimizeNames(names, constants)) return;
            this.iterable = optimizeExpr(this.iterable, names, constants);
            return this;
        }
        get names() {
            return addNames(super.names, this.iterable.names);
        }
    }
    class Func extends BlockNode {
        constructor(name3, args1, async1){
            super();
            this.name = name3;
            this.args = args1;
            this.async = async1;
        }
        render(opts) {
            const _async = this.async ? "async " : "";
            return `${_async}function ${this.name}(${this.args})` + super.render(opts);
        }
    }
    Func.kind = "func";
    class Return extends ParentNode {
        render(opts) {
            return "return " + super.render(opts);
        }
    }
    Return.kind = "return";
    class Try extends BlockNode {
        render(opts) {
            let code21 = "try" + super.render(opts);
            if (this.catch) code21 += this.catch.render(opts);
            if (this.finally) code21 += this.finally.render(opts);
            return code21;
        }
        optimizeNodes() {
            var _a, _b;
            super.optimizeNodes();
            (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
            (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
            return this;
        }
        optimizeNames(names, constants) {
            var _a, _b;
            super.optimizeNames(names, constants);
            (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
            (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
            return this;
        }
        get names() {
            const names = super.names;
            if (this.catch) addNames(names, this.catch.names);
            if (this.finally) addNames(names, this.finally.names);
            return names;
        }
    }
    class Catch extends BlockNode {
        constructor(error1){
            super();
            this.error = error1;
        }
        render(opts) {
            return `catch(${this.error})` + super.render(opts);
        }
    }
    Catch.kind = "catch";
    class Finally extends BlockNode {
        render(opts) {
            return "finally" + super.render(opts);
        }
    }
    Finally.kind = "finally";
    class CodeGen {
        constructor(extScope, opts = {
        }){
            this._values = {
            };
            this._blockStarts = [];
            this._constants = {
            };
            this.opts = {
                ...opts,
                _n: opts.lines ? "\n" : ""
            };
            this._extScope = extScope;
            this._scope = new __VIRTUAL_FILE$11.Scope({
                parent: extScope
            });
            this._nodes = [
                new Root()
            ];
        }
        toString() {
            return this._root.render(this.opts);
        }
        name(prefix) {
            return this._scope.name(prefix);
        }
        scopeName(prefix) {
            return this._extScope.name(prefix);
        }
        scopeValue(prefixOrName, value) {
            const name4 = this._extScope.value(prefixOrName, value);
            const vs = this._values[name4.prefix] || (this._values[name4.prefix] = new Set());
            vs.add(name4);
            return name4;
        }
        getScopeValue(prefix, keyOrRef) {
            return this._extScope.getValue(prefix, keyOrRef);
        }
        scopeRefs(scopeName) {
            return this._extScope.scopeRefs(scopeName, this._values);
        }
        scopeCode() {
            return this._extScope.scopeCode(this._values);
        }
        _def(varKind, nameOrPrefix, rhs, constant) {
            const name4 = this._scope.toName(nameOrPrefix);
            if (rhs !== void 0 && constant) this._constants[name4.str] = rhs;
            this._leafNode(new Def(varKind, name4, rhs));
            return name4;
        }
        const(nameOrPrefix, rhs, _constant) {
            return this._def(__VIRTUAL_FILE$11.varKinds.const, nameOrPrefix, rhs, _constant);
        }
        let(nameOrPrefix, rhs, _constant) {
            return this._def(__VIRTUAL_FILE$11.varKinds.let, nameOrPrefix, rhs, _constant);
        }
        var(nameOrPrefix, rhs, _constant) {
            return this._def(__VIRTUAL_FILE$11.varKinds.var, nameOrPrefix, rhs, _constant);
        }
        assign(lhs, rhs, sideEffects) {
            return this._leafNode(new Assign(lhs, rhs, sideEffects));
        }
        add(lhs, rhs) {
            return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
        }
        code(c) {
            if (typeof c == "function") c();
            else if (c !== __VIRTUAL_FILE$1.nil) this._leafNode(new AnyCode(c));
            return this;
        }
        object(...keyValues) {
            const code21 = [
                "{"
            ];
            for (const [key, value] of keyValues){
                if (code21.length > 1) code21.push(",");
                code21.push(key);
                if (key !== value || this.opts.es5) {
                    code21.push(":");
                    __VIRTUAL_FILE$1.addCodeArg(code21, value);
                }
            }
            code21.push("}");
            return new __VIRTUAL_FILE$1._Code(code21);
        }
        if(condition, thenBody, elseBody) {
            this._blockNode(new If(condition));
            if (thenBody && elseBody) {
                this.code(thenBody).else().code(elseBody).endIf();
            } else if (thenBody) {
                this.code(thenBody).endIf();
            } else if (elseBody) {
                throw new Error('CodeGen: "else" body without "then" body');
            }
            return this;
        }
        elseIf(condition) {
            return this._elseNode(new If(condition));
        }
        else() {
            return this._elseNode(new Else());
        }
        endIf() {
            return this._endBlockNode(If, Else);
        }
        _for(node, forBody) {
            this._blockNode(node);
            if (forBody) this.code(forBody).endFor();
            return this;
        }
        for(iteration, forBody) {
            return this._for(new ForLoop(iteration), forBody);
        }
        forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? __VIRTUAL_FILE$11.varKinds.var : __VIRTUAL_FILE$11.varKinds.let) {
            const name4 = this._scope.toName(nameOrPrefix);
            return this._for(new ForRange(varKind, name4, from, to), ()=>forBody(name4)
            );
        }
        forOf(nameOrPrefix, iterable, forBody, varKind = __VIRTUAL_FILE$11.varKinds.const) {
            const name4 = this._scope.toName(nameOrPrefix);
            if (this.opts.es5) {
                const arr = iterable instanceof __VIRTUAL_FILE$1.Name ? iterable : this.var("_arr", iterable);
                return this.forRange("_i", 0, __VIRTUAL_FILE$1._`${arr}.length`, (i)=>{
                    this.var(name4, __VIRTUAL_FILE$1._`${arr}[${i}]`);
                    forBody(name4);
                });
            }
            return this._for(new ForIter("of", varKind, name4, iterable), ()=>forBody(name4)
            );
        }
        forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? __VIRTUAL_FILE$11.varKinds.var : __VIRTUAL_FILE$11.varKinds.const) {
            if (this.opts.ownProperties) {
                return this.forOf(nameOrPrefix, __VIRTUAL_FILE$1._`Object.keys(${obj})`, forBody);
            }
            const name4 = this._scope.toName(nameOrPrefix);
            return this._for(new ForIter("in", varKind, name4, obj), ()=>forBody(name4)
            );
        }
        endFor() {
            return this._endBlockNode(For);
        }
        label(label) {
            return this._leafNode(new Label(label));
        }
        break(label) {
            return this._leafNode(new Break(label));
        }
        return(value) {
            const node = new Return();
            this._blockNode(node);
            this.code(value);
            if (node.nodes.length !== 1) throw new Error('CodeGen: "return" should have one node');
            return this._endBlockNode(Return);
        }
        try(tryBody, catchCode, finallyCode) {
            if (!catchCode && !finallyCode) throw new Error('CodeGen: "try" without "catch" and "finally"');
            const node = new Try();
            this._blockNode(node);
            this.code(tryBody);
            if (catchCode) {
                const error2 = this.name("e");
                this._currNode = node.catch = new Catch(error2);
                catchCode(error2);
            }
            if (finallyCode) {
                this._currNode = node.finally = new Finally();
                this.code(finallyCode);
            }
            return this._endBlockNode(Catch, Finally);
        }
        throw(error) {
            return this._leafNode(new Throw(error));
        }
        block(body, nodeCount) {
            this._blockStarts.push(this._nodes.length);
            if (body) this.code(body).endBlock(nodeCount);
            return this;
        }
        endBlock(nodeCount) {
            const len = this._blockStarts.pop();
            if (len === void 0) throw new Error("CodeGen: not in self-balancing block");
            const toClose = this._nodes.length - len;
            if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
                throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
            }
            this._nodes.length = len;
            return this;
        }
        func(name, args = __VIRTUAL_FILE$1.nil, async, funcBody) {
            this._blockNode(new Func(name, args, async));
            if (funcBody) this.code(funcBody).endFunc();
            return this;
        }
        endFunc() {
            return this._endBlockNode(Func);
        }
        optimize(n = 1) {
            while((n--) > 0){
                this._root.optimizeNodes();
                this._root.optimizeNames(this._root.names, this._constants);
            }
        }
        _leafNode(node) {
            this._currNode.nodes.push(node);
            return this;
        }
        _blockNode(node) {
            this._currNode.nodes.push(node);
            this._nodes.push(node);
        }
        _endBlockNode(N1, N2) {
            const n = this._currNode;
            if (n instanceof N1 || N2 && n instanceof N2) {
                this._nodes.pop();
                return this;
            }
            throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
        }
        _elseNode(node) {
            const n = this._currNode;
            if (!(n instanceof If)) {
                throw new Error('CodeGen: "else" without "if"');
            }
            this._currNode = n.else = node;
            return this;
        }
        get _root() {
            return this._nodes[0];
        }
        get _currNode() {
            const ns = this._nodes;
            return ns[ns.length - 1];
        }
        set _currNode(node) {
            const ns = this._nodes;
            ns[ns.length - 1] = node;
        }
    }
    exports.CodeGen = CodeGen;
    function addNames(names, from2) {
        for(const n in from2)names[n] = (names[n] || 0) + (from2[n] || 0);
        return names;
    }
    function addExprNames(names, from2) {
        return from2 instanceof __VIRTUAL_FILE$1._CodeOrName ? addNames(names, from2.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
        if (expr instanceof __VIRTUAL_FILE$1.Name) return replaceName(expr);
        if (!canOptimize(expr)) return expr;
        return new __VIRTUAL_FILE$1._Code(expr._items.reduce((items1, c)=>{
            if (c instanceof __VIRTUAL_FILE$1.Name) c = replaceName(c);
            if (c instanceof __VIRTUAL_FILE$1._Code) items1.push(...c._items);
            else items1.push(c);
            return items1;
        }, []));
        function replaceName(n) {
            const c = constants[n.str];
            if (c === void 0 || names[n.str] !== 1) return n;
            delete names[n.str];
            return c;
        }
        function canOptimize(e) {
            return e instanceof __VIRTUAL_FILE$1._Code && e._items.some((c)=>c instanceof __VIRTUAL_FILE$1.Name && names[c.str] === 1 && constants[c.str] !== void 0
            );
        }
    }
    function subtractNames(names, from2) {
        for(const n in from2)names[n] = (names[n] || 0) - (from2[n] || 0);
    }
    function not2(x) {
        return typeof x == "boolean" || typeof x == "number" || x === null ? !x : __VIRTUAL_FILE$1._`!${par(x)}`;
    }
    exports.not = not2;
    const andCode = mappend(exports.operators.AND);
    function and(...args2) {
        return args2.reduce(andCode);
    }
    exports.and = and;
    const orCode = mappend(exports.operators.OR);
    function or(...args2) {
        return args2.reduce(orCode);
    }
    exports.or = or;
    function mappend(op1) {
        return (x, y)=>x === __VIRTUAL_FILE$1.nil ? y : y === __VIRTUAL_FILE$1.nil ? x : __VIRTUAL_FILE$1._`${par(x)} ${op1} ${par(y)}`
        ;
    }
    function par(x) {
        return x instanceof __VIRTUAL_FILE$1.Name ? x : __VIRTUAL_FILE$1._`(${x})`;
    }
});
var __VIRTUAL_FILE$12 = getDefaultExportFromCjs4(__VIRTUAL_FILE2);
function getDefaultExportFromCjs5(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function createCommonjsModule6(fn, basedir, module) {
    return module = {
        path: basedir,
        exports: {
        },
        require: function(path, base) {
            return commonjsRequire4(path, base === void 0 || base === null ? module.path : base);
        }
    }, fn(module, module.exports), module.exports;
}
function commonjsRequire4() {
    throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs");
}
var formats = createCommonjsModule6(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
    function fmtDef(validate1, compare) {
        return {
            validate: validate1,
            compare
        };
    }
    exports.fullFormats = {
        date: fmtDef(date, compareDate),
        time: fmtDef(time, compareTime),
        "date-time": fmtDef(date_time, compareDateTime),
        duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
        uri,
        "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
        "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
        url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
        email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
        hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
        ipv4: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
        ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
        regex,
        uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
        "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
        "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
        "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/
    };
    exports.fastFormats = {
        ...exports.fullFormats,
        date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
        time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareTime),
        "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
        uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
        "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
        email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports.formatNames = Object.keys(exports.fullFormats);
    function isLeapYear(year) {
        return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    const DAYS = [
        0,
        31,
        28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
    ];
    function date(str) {
        const matches = DATE.exec(str);
        if (!matches) return false;
        const year = +matches[1];
        const month = +matches[2];
        const day = +matches[3];
        return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
        if (!(d1 && d2)) return void 0;
        if (d1 > d2) return 1;
        if (d1 < d2) return -1;
        return 0;
    }
    const TIME = /^(\d\d):(\d\d):(\d\d)(\.\d+)?(z|[+-]\d\d(?::?\d\d)?)?$/i;
    function time(str, withTimeZone) {
        const matches = TIME.exec(str);
        if (!matches) return false;
        const hour = +matches[1];
        const minute = +matches[2];
        const second = +matches[3];
        const timeZone = matches[5];
        return (hour <= 23 && minute <= 59 && second <= 59 || hour === 23 && minute === 59 && second === 60) && (!withTimeZone || timeZone !== "");
    }
    function compareTime(t1, t2) {
        if (!(t1 && t2)) return void 0;
        const a1 = TIME.exec(t1);
        const a2 = TIME.exec(t2);
        if (!(a1 && a2)) return void 0;
        t1 = a1[1] + a1[2] + a1[3] + (a1[4] || "");
        t2 = a2[1] + a2[2] + a2[3] + (a2[4] || "");
        if (t1 > t2) return 1;
        if (t1 < t2) return -1;
        return 0;
    }
    const DATE_TIME_SEPARATOR = /t|\s/i;
    function date_time(str) {
        const dateTime = str.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1], true);
    }
    function compareDateTime(dt1, dt2) {
        if (!(dt1 && dt2)) return void 0;
        const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
        const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
        const res = compareDate(d1, d2);
        if (res === void 0) return void 0;
        return res || compareTime(t1, t2);
    }
    const NOT_URI_FRAGMENT = /\/|:/;
    const URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri(str) {
        return NOT_URI_FRAGMENT.test(str) && URI.test(str);
    }
    const Z_ANCHOR = /[^\\]\\Z/;
    function regex(str) {
        if (Z_ANCHOR.test(str)) return false;
        try {
            new RegExp(str);
            return true;
        } catch (e) {
            return false;
        }
    }
});
var limit = createCommonjsModule6(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.formatLimitDefinition = void 0;
    const ops = __VIRTUAL_FILE$12.operators;
    const KWDs = {
        formatMaximum: {
            okStr: "<=",
            ok: ops.LTE,
            fail: ops.GT
        },
        formatMinimum: {
            okStr: ">=",
            ok: ops.GTE,
            fail: ops.LT
        },
        formatExclusiveMaximum: {
            okStr: "<",
            ok: ops.LT,
            fail: ops.GTE
        },
        formatExclusiveMinimum: {
            okStr: ">",
            ok: ops.GT,
            fail: ops.LTE
        }
    };
    const error = {
        message: ({ keyword: keyword1 , schemaCode  })=>__VIRTUAL_FILE$12.str`should be ${KWDs[keyword1].okStr} ${schemaCode}`
        ,
        params: ({ keyword: keyword1 , schemaCode  })=>__VIRTUAL_FILE$12._`{comparison: ${KWDs[keyword1].okStr}, limit: ${schemaCode}}`
    };
    exports.formatLimitDefinition = {
        keyword: Object.keys(KWDs),
        type: "string",
        schemaType: "string",
        $data: true,
        error,
        code (cxt) {
            const { gen , data , schemaCode , keyword: keyword1 , it  } = cxt;
            const { opts , self  } = it;
            if (!opts.validateFormats) return;
            const fCxt = new __pika_web_default_export_for_treeshaking__1.KeywordCxt(it, self.RULES.all.format.definition, "format");
            if (fCxt.$data) validate$DataFormat();
            else validateFormat();
            function validate$DataFormat() {
                const fmts = gen.scopeValue("formats", {
                    ref: self.formats,
                    code: opts.code.formats
                });
                const fmt = gen.const("fmt", __VIRTUAL_FILE$12._`${fmts}[${fCxt.schemaCode}]`);
                cxt.fail$data(__VIRTUAL_FILE$12.or(__VIRTUAL_FILE$12._`typeof ${fmt} != "object"`, __VIRTUAL_FILE$12._`${fmt} instanceof RegExp`, __VIRTUAL_FILE$12._`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
            }
            function validateFormat() {
                const format1 = fCxt.schema;
                const fmtDef = self.formats[format1];
                if (!fmtDef || fmtDef === true) return;
                if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
                    throw new Error(`"${keyword1}": format "${format1}" does not define "compare" function`);
                }
                const fmt = gen.scopeValue("formats", {
                    key: format1,
                    ref: fmtDef,
                    code: opts.code.formats ? __VIRTUAL_FILE$12._`${opts.code.formats}${__VIRTUAL_FILE$12.getProperty(format1)}` : void 0
                });
                cxt.fail$data(compareCode(fmt));
            }
            function compareCode(fmt) {
                return __VIRTUAL_FILE$12._`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword1].fail} 0`;
            }
        },
        dependencies: [
            "format"
        ]
    };
    const formatLimitPlugin = (ajv2)=>{
        ajv2.addKeyword(exports.formatLimitDefinition);
        return ajv2;
    };
    exports.default = formatLimitPlugin;
});
var dist = createCommonjsModule6(function(module, exports) {
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    const fullName = new __VIRTUAL_FILE$12.Name("fullFormats");
    const fastName = new __VIRTUAL_FILE$12.Name("fastFormats");
    const formatsPlugin = (ajv2, opts = {
        keywords: true
    })=>{
        if (Array.isArray(opts)) {
            addFormats(ajv2, opts, formats.fullFormats, fullName);
            return ajv2;
        }
        const [formats$1, exportName] = opts.mode === "fast" ? [
            formats.fastFormats,
            fastName
        ] : [
            formats.fullFormats,
            fullName
        ];
        const list = opts.formats || formats.formatNames;
        addFormats(ajv2, list, formats$1, exportName);
        if (opts.keywords) limit.default(ajv2);
        return ajv2;
    };
    formatsPlugin.get = (name, mode = "full")=>{
        const formats$1 = mode === "fast" ? formats.fastFormats : formats.fullFormats;
        const f = formats$1[name];
        if (!f) throw new Error(`Unknown format "${name}"`);
        return f;
    };
    function addFormats(ajv2, list, fs, exportName) {
        var _a;
        var _b;
        (_a = (_b = ajv2.opts.code).formats) !== null && _a !== void 0 ? _a : _b.formats = __VIRTUAL_FILE$12._`require("ajv-formats/dist/formats").${exportName}`;
        for (const f of list)ajv2.addFormat(f, fs[f]);
    }
    module.exports = exports = formatsPlugin;
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.default = formatsPlugin;
});
var index = getDefaultExportFromCjs5(dist);
function validate1(schema, value, options = {
    allErrors: true
}) {
    return createValidator(schema, options)(value);
}
function createValidator(schema, options = {
    allErrors: true
}) {
    const ajv1 = new __pika_web_default_export_for_treeshaking__1(options);
    ajv1.addKeyword("kind");
    ajv1.addKeyword("modifier");
    index(ajv1);
    const validate2 = ajv1.compile(schema);
    return (value)=>{
        if (!validate2(value)) {
            return {
                isSuccess: false,
                errors: validate2.errors,
                errorsToString: (options1)=>ajv1.errorsText(validate2.errors, options1)
            };
        }
        return {
            isSuccess: true,
            value: value
        };
    };
}
function createCliAction(args, action) {
    return {
        args,
        action
    };
}
class ExitCode {
    code;
    static of(code) {
        return new ExitCode(code);
    }
    static Zero = new ExitCode(0);
    static One = new ExitCode(1);
    constructor(code2){
        this.code = code2;
    }
}
async function waitForExitSignal() {
    await Promise.race([
        Deno.signal(Deno.Signal.SIGINT),
        Deno.signal(Deno.Signal.SIGTERM), 
    ]);
    return new ExitCode(123);
}
function jsonSchemaToTypeName(schema) {
    if (schema.const !== undefined) {
        return JSON.stringify(schema.const);
    }
    if (schema.anyOf !== undefined) {
        return schema.anyOf.map((t)=>jsonSchemaToTypeName(t)
        ).join(" | ");
    }
    if (schema.enum !== undefined) {
        return schema.enum.map((v)=>JSON.stringify(v)
        ).join(" | ");
    }
    if (schema.type !== undefined) {
        if (schema.type === "array") {
            if (Array.isArray(schema.items)) {
                return `[${schema.items.map(jsonSchemaToTypeName).join(", ")}]`;
            }
            return `${jsonSchemaToTypeName(schema.items)}...`;
        }
        return schema.type;
    }
    return "unknown";
}
class CliProgram {
    actions = new Map();
    onExit(exitCode) {
        Deno.exit(exitCode.code);
    }
    constructor(onExit){
        if (onExit) {
            this.onExit = onExit;
        }
    }
    addAction(command, action) {
        this.actions.set(command, action);
        return this;
    }
    printProgramError(error) {
        const supportedCommands = Array.from(this.actions.keys());
        console.error(`[Error] ${error}\n\nSUPPORTED COMMANDS:\n${supportedCommands.map((cmd)=>`  - ${cmd}`
        ).join("\n")}`);
    }
    printActionError(error, command, action) {
        const args = action.args;
        const requiredArgSet = new Set(args.required);
        const props = Object.entries(args.properties);
        const renderProps = props.map(([name, prop])=>{
            const required1 = requiredArgSet.has(name);
            const defaultValue = JSON.stringify(prop.default);
            const argument = prop.default !== undefined ? `--${name}=${defaultValue}` : required1 ? `--${name}` : `[--${name}]`;
            return {
                name,
                argument,
                required: required1,
                typeName: `(${jsonSchemaToTypeName(prop)})`,
                description: (prop.description ?? prop.title) ?? "",
                examples: ((prop.examples && JSON.stringify(prop.examples[0])) ?? defaultValue) ?? "..."
            };
        });
        const usageArgs = renderProps.map(({ name , required: required1 , examples  })=>`${required1 ? "" : "["}--${name}=${examples}${required1 ? "" : "]"}`
        );
        const maxArgumentLength = renderProps.reduce((max, { argument  })=>Math.max(max, argument.length)
        , 0);
        const maxTypeNameLength = renderProps.reduce((max, { typeName  })=>Math.max(max, typeName.length)
        , 0);
        const actionHelp = renderProps.map(({ argument , typeName , description: description1  })=>{
            return `    ${argument.padEnd(maxArgumentLength)} ${typeName.padEnd(maxTypeNameLength)} ${description1}`;
        }).join("\n");
        console.error(`[Error] ${error}\n\nUSAGE EXAMPLE:\n\n    ${command} ${usageArgs.join(" ")}\n\nARGUMENTS:\n\n${actionHelp}`);
    }
    async run(rawArgs) {
        const { _ , ...args } = parse(rawArgs);
        if (_.length !== 1) {
            if (_.length === 0) {
                this.printProgramError("No command provided");
            } else {
                this.printProgramError(`Invalid commands: ${_.join(" ")}`);
            }
            return Deno.exit(1);
        }
        const command = String(_[0]);
        const action = this.actions.get(command);
        if (!action) {
            this.printProgramError(`Unknown command: ${command}`);
            return Deno.exit(1);
        }
        const validationResult = validate1(action.args, args, {
            coerceTypes: true,
            strict: "log",
            allErrors: true
        });
        if (validationResult.isSuccess) {
            const exitCode = await Promise.race([
                action.action(validationResult.value),
                waitForExitSignal(), 
            ]);
            this.onExit(exitCode);
        } else {
            this.printActionError(`Invalid arguments for command: ${command}\n${validationResult.errorsToString({
                separator: "\n",
                dataVar: "    -"
            }).replaceAll("property", "argument").replaceAll("    -/", "    - /")}`, command, action);
            this.onExit(ExitCode.One);
        }
    }
}
const ReadonlyOptionalModifier = Symbol("ReadonlyOptionalModifier");
const OptionalModifier = Symbol("OptionalModifier");
const ReadonlyModifier = Symbol("ReadonlyModifier");
const KeyOfKind = Symbol("KeyOfKind");
const UnionKind = Symbol("UnionKind");
const TupleKind = Symbol("TupleKind");
const ObjectKind = Symbol("ObjectKind");
const DictKind = Symbol("DictKind");
const ArrayKind = Symbol("ArrayKind");
const EnumKind = Symbol("EnumKind");
const LiteralKind = Symbol("LiteralKind");
const StringKind = Symbol("StringKind");
const NumberKind = Symbol("NumberKind");
const IntegerKind = Symbol("IntegerKind");
const BooleanKind = Symbol("BooleanKind");
const NullKind = Symbol("NullKind");
const UnknownKind = Symbol("UnknownKind");
const AnyKind = Symbol("AnyKind");
const ConstructorKind = Symbol("ConstructorKind");
const FunctionKind = Symbol("FunctionKind");
const PromiseKind = Symbol("PromiseKind");
const UndefinedKind = Symbol("UndefinedKind");
const VoidKind = Symbol("VoidKind");
function clone(object) {
    if (typeof object === "object" && object !== null && !Array.isArray(object)) {
        return Object.keys(object).reduce((acc, key)=>{
            acc[key] = clone(object[key]);
            return acc;
        }, {
        });
    } else if (typeof object === "object" && object !== null && Array.isArray(object)) {
        return object.map((item)=>clone(item)
        );
    } else {
        return object;
    }
}
class TypeBuilder {
    ReadonlyOptional(item) {
        return {
            ...item,
            modifier: ReadonlyOptionalModifier
        };
    }
    Readonly(item) {
        return {
            ...item,
            modifier: ReadonlyModifier
        };
    }
    Optional(item) {
        return {
            ...item,
            modifier: OptionalModifier
        };
    }
    Tuple(items, options = {
    }) {
        const additionalItems1 = false;
        const minItems = items.length;
        const maxItems = items.length;
        return {
            ...options,
            kind: TupleKind,
            type: "array",
            items,
            additionalItems: false,
            minItems,
            maxItems
        };
    }
    Object(properties, options = {
        additionalProperties: false
    }) {
        const property_names = Object.keys(properties);
        const optional = property_names.filter((name)=>{
            const candidate = properties[name];
            return candidate.modifier && (candidate.modifier === OptionalModifier || candidate.modifier === ReadonlyOptionalModifier);
        });
        const required_names = property_names.filter((name)=>!optional.includes(name)
        );
        const required1 = required_names.length > 0 ? required_names : undefined;
        const additionalProperties = options.additionalProperties;
        return required1 ? {
            ...options,
            kind: ObjectKind,
            type: "object",
            additionalProperties,
            properties,
            required: required1
        } : {
            ...options,
            kind: ObjectKind,
            type: "object",
            additionalProperties,
            properties
        };
    }
    PartialObject(properties) {
        return Type.Object(properties, {
            additionalProperties: true
        });
    }
    Dict(item, options = {
    }) {
        const additionalProperties = item;
        return {
            ...options,
            kind: DictKind,
            type: "object",
            additionalProperties
        };
    }
    Array(items, options = {
    }) {
        return {
            ...options,
            kind: ArrayKind,
            type: "array",
            items
        };
    }
    Enum(item, options = {
    }) {
        const values = Object.keys(item).filter((key)=>isNaN(key)
        ).map((key)=>item[key]
        );
        if (values.length === 0) {
            return {
                ...options,
                kind: EnumKind,
                enum: values
            };
        }
        const type1 = typeof values[0];
        if (values.some((value)=>typeof value !== type1
        )) {
            return {
                ...options,
                kind: EnumKind,
                type: [
                    "string",
                    "number"
                ],
                enum: values
            };
        }
        return {
            ...options,
            kind: EnumKind,
            type: type1,
            enum: values
        };
    }
    Literal(value, options = {
    }) {
        return {
            ...options,
            kind: LiteralKind,
            const: value,
            type: typeof value
        };
    }
    String(options = {
    }) {
        return {
            ...options,
            kind: StringKind,
            type: "string"
        };
    }
    RegEx(regex, options = {
    }) {
        return this.String({
            ...options,
            pattern: regex.source
        });
    }
    Number(options = {
    }) {
        return {
            ...options,
            kind: NumberKind,
            type: "number"
        };
    }
    Integer(options = {
    }) {
        return {
            ...options,
            kind: IntegerKind,
            type: "integer"
        };
    }
    Boolean(options = {
    }) {
        return {
            ...options,
            kind: BooleanKind,
            type: "boolean"
        };
    }
    Null(options = {
    }) {
        return {
            ...options,
            kind: NullKind,
            type: "null"
        };
    }
    Unknown(options = {
    }) {
        return {
            ...options,
            kind: UnknownKind
        };
    }
    Any(options = {
    }) {
        return {
            ...options,
            kind: AnyKind
        };
    }
    Union(items, options = {
    }) {
        return {
            ...options,
            kind: UnionKind,
            anyOf: items
        };
    }
    KeyOf(schema, options = {
    }) {
        const keys = Object.keys(schema.properties);
        return {
            ...options,
            kind: KeyOfKind,
            type: "string",
            enum: keys
        };
    }
    Intersect(items, options = {
    }) {
        const type1 = "object";
        const additionalProperties = false;
        const properties2 = items.reduce((acc, object)=>({
                ...acc,
                ...object["properties"]
            })
        , {
        });
        const required1 = items.reduce((acc, object)=>object["required"] ? [
                ...acc,
                ...object["required"]
            ] : acc
        , []);
        return {
            ...options,
            type: type1,
            kind: ObjectKind,
            additionalProperties: false,
            properties: properties2,
            required: required1
        };
    }
    Required(schema, options = {
    }) {
        const next = {
            ...options,
            ...clone(schema)
        };
        next.required = Object.keys(next.properties);
        for (const key of Object.keys(next.properties)){
            const property = next.properties[key];
            switch(property.modifier){
                case ReadonlyOptionalModifier:
                    property.modifier = ReadonlyModifier;
                    break;
                case ReadonlyModifier:
                    property.modifier = ReadonlyModifier;
                    break;
                case OptionalModifier:
                    delete property.modifier;
                    break;
                default:
                    delete property.modifier;
                    break;
            }
        }
        return next;
    }
    Partial(schema, options = {
    }) {
        const next = {
            ...options,
            ...clone(schema)
        };
        delete next.required;
        for (const key of Object.keys(next.properties)){
            const property = next.properties[key];
            switch(property.modifier){
                case ReadonlyOptionalModifier:
                    property.modifier = ReadonlyOptionalModifier;
                    break;
                case ReadonlyModifier:
                    property.modifier = ReadonlyOptionalModifier;
                    break;
                case OptionalModifier:
                    property.modifier = OptionalModifier;
                    break;
                default:
                    property.modifier = OptionalModifier;
                    break;
            }
        }
        return next;
    }
    Pick(schema, keys, options = {
    }) {
        const next = {
            ...options,
            ...clone(schema)
        };
        next.required = next.required ? next.required.filter((key)=>keys.includes(key)
        ) : undefined;
        for (const key of Object.keys(next.properties)){
            if (!keys.includes(key)) delete next.properties[key];
        }
        return next;
    }
    Omit(schema, keys, options = {
    }) {
        const next = {
            ...options,
            ...clone(schema)
        };
        next.required = next.required ? next.required.filter((key)=>!keys.includes(key)
        ) : undefined;
        for (const key of Object.keys(next.properties)){
            if (keys.includes(key)) delete next.properties[key];
        }
        return next;
    }
    Strict(schema) {
        return JSON.parse(JSON.stringify(schema));
    }
    Constructor(args, returns, options = {
    }) {
        return {
            ...options,
            kind: ConstructorKind,
            type: "constructor",
            arguments: args,
            returns
        };
    }
    Function(args, returns, options = {
    }) {
        return {
            ...options,
            kind: FunctionKind,
            type: "function",
            arguments: args,
            returns
        };
    }
    Promise(item, options = {
    }) {
        return {
            ...options,
            type: "promise",
            kind: PromiseKind,
            item
        };
    }
    Undefined(options = {
    }) {
        return {
            ...options,
            type: "undefined",
            kind: UndefinedKind
        };
    }
    Void(options = {
    }) {
        return {
            ...options,
            type: "void",
            kind: VoidKind
        };
    }
}
const Type = new TypeBuilder();
var Level;
(function(Level1) {
    Level1[Level1["Trace"] = 10] = "Trace";
    Level1[Level1["Debug"] = 20] = "Debug";
    Level1[Level1["Info"] = 30] = "Info";
    Level1[Level1["Warn"] = 40] = "Warn";
    Level1[Level1["Error"] = 50] = "Error";
    Level1[Level1["Critical"] = 60] = "Critical";
})(Level || (Level = {
}));
const levelMap = new Map();
levelMap.set(10, "Trace");
levelMap.set(20, "Debug");
levelMap.set(30, "Info");
levelMap.set(40, "Warn");
levelMap.set(50, "Error");
levelMap.set(60, "Critical");
const levelNameMap = new Map();
levelNameMap.set("Trace", Level.Trace);
levelNameMap.set("Debug", Level.Debug);
levelNameMap.set("Info", Level.Info);
levelNameMap.set("Warn", Level.Warn);
levelNameMap.set("Error", Level.Error);
levelNameMap.set("Critical", Level.Critical);
function levelToName(level) {
    const levelAsString = levelMap.get(level);
    return levelAsString ? levelAsString : "UNKNOWN";
}
function nameToLevel(name) {
    const level = levelNameMap.get(name);
    return level === undefined ? 1 : level;
}
function longestLevelName() {
    let longest = 0;
    for (const key of levelNameMap.keys()){
        longest = key.length > longest ? key.length : longest;
    }
    return longest;
}
class BaseStream {
    #minLevel = Level.Trace;
    #formatter;
    #started = new Date();
    outputHeader = true;
    outputFooter = true;
    constructor(defaultFormatters){
        this.#formatter = defaultFormatters;
    }
    setup() {
        this.#started = new Date();
    }
    destroy() {
    }
    handle(logRecord) {
        if (this.#minLevel > logRecord.level) return false;
        const msg = this.format(logRecord);
        this.log(msg);
        return true;
    }
    get minLogLevel() {
        return this.#minLevel;
    }
    withMinLogLevel(level) {
        this.#minLevel = level;
        return this;
    }
    withFormat(newFormatter) {
        this.#formatter = newFormatter;
        return this;
    }
    withLogHeader(on) {
        this.outputHeader = on === undefined || on;
        return this;
    }
    withLogFooter(on) {
        this.outputFooter = on === undefined || on;
        return this;
    }
    format(logRecord) {
        return this.#formatter.format(logRecord);
    }
    logHeader(meta) {
        if (!this.outputHeader) return;
        const minLogLevel = meta.minLogLevelFrom === "default" ? "" : "Initial logger min log level: " + levelToName(meta.minLogLevel) + " (" + meta.minLogLevelFrom + ")";
        this.log(this.format(this.logRecord(meta, "Logging session initialized. " + minLogLevel, false)));
    }
    logFooter(meta) {
        if (!this.outputFooter) return;
        this.log(this.format(this.logRecord(meta, "Logging session complete.  Duration: " + (new Date().getTime() - this.#started.getTime()) + "ms", true)));
    }
    logRecord(meta, msg, logMeta) {
        return {
            msg: msg,
            metadata: logMeta ? [
                meta.toRecord(this)
            ] : [],
            dateTime: new Date(),
            level: Level.Info,
            logger: meta.logger
        };
    }
}
class ValidationError extends Error {
    constructor(message1){
        super(message1);
        this.name = "ValidationError";
    }
}
class IllegalStateError extends Error {
    constructor(message2){
        super(message2);
        this.name = "IllegalStateError";
    }
}
class TimeUnit {
    milliseconds;
    static MILLISECONDS = new TimeUnit(1);
    static SECONDS = new TimeUnit(1000);
    static MINUTES = new TimeUnit(60000);
    static HOURS = new TimeUnit(3600000);
    static DAYS = new TimeUnit(86400000);
    constructor(milliseconds){
        this.milliseconds = milliseconds;
    }
    getMilliseconds() {
        return this.milliseconds;
    }
}
class SimpleDateTimeFormatter {
    format;
    constructor(format2){
        this.format = format2;
    }
    #shortDays = [
        "Sun",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat"
    ];
    #longDays = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday", 
    ];
    #shortMonths = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec", 
    ];
    #longMonths = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December", 
    ];
    formatDateTime(dateTime) {
        let formatted = this.format;
        if (formatted.indexOf("hh") >= 0) {
            formatted = formatted.replace("hh", String(dateTime.getHours()).padStart(2, "0"));
        } else if (formatted.indexOf("h") >= 0) {
            formatted = formatted.replace("h", String(dateTime.getHours()));
        } else if (formatted.indexOf("HH") >= 0) {
            formatted = formatted.replace("HH", String(dateTime.getHours() % 12 || 12).padStart(2, "0"));
        } else if (formatted.indexOf("H") >= 0) {
            formatted = formatted.replace("H", String(dateTime.getHours() % 12 || 12));
        }
        if (formatted.indexOf("mm") >= 0) {
            formatted = formatted.replace("mm", String(dateTime.getMinutes()).padStart(2, "0"));
        }
        if (formatted.indexOf("ss") >= 0) {
            formatted = formatted.replace("ss", String(dateTime.getSeconds()).padStart(2, "0"));
        }
        if (formatted.indexOf("SSS") >= 0) {
            formatted = formatted.replace("SSS", this.toStringWithSignificantDigits(dateTime.getMilliseconds(), 3));
        } else if (formatted.indexOf("SS") >= 0) {
            formatted = formatted.replace("SS", this.toStringWithSignificantDigits(dateTime.getMilliseconds(), 2));
        } else if (formatted.indexOf("S") >= 0) {
            formatted = formatted.replace("S", this.toStringWithSignificantDigits(dateTime.getMilliseconds(), 1));
        }
        if (formatted.indexOf("a") >= 0) {
            formatted = formatted.replace("a", dateTime.getHours() < 12 ? "am" : "pm");
        } else if (formatted.indexOf("A") >= 0) {
            formatted = formatted.replace("A", dateTime.getHours() < 12 ? "AM" : "PM");
        }
        if (formatted.indexOf("YYYY") >= 0) {
            formatted = formatted.replace("YYYY", String(dateTime.getFullYear()));
        } else if (formatted.indexOf("YY") >= 0) {
            formatted = formatted.replace("YY", String(dateTime.getFullYear()).slice(2));
        }
        if (formatted.indexOf("DD") >= 0) {
            formatted = formatted.replace("DD", String(dateTime.getDate()).padStart(2, "0"));
        } else if (formatted.indexOf("D") >= 0) {
            formatted = formatted.replace("D", String(dateTime.getDate()));
        }
        if (formatted.indexOf("MMMM") >= 0) {
            formatted = formatted.replace("MMMM", this.#longMonths[dateTime.getMonth()]);
        } else if (formatted.indexOf("MMM") >= 0) {
            formatted = formatted.replace("MMM", this.#shortMonths[dateTime.getMonth()]);
        } else if (formatted.indexOf("MM") >= 0) {
            formatted = formatted.replace("MM", String(dateTime.getMonth() + 1).padStart(2, "0"));
        } else if (formatted.indexOf("M") >= 0) {
            formatted = formatted.replace("M", String(dateTime.getMonth() + 1));
        }
        if (formatted.indexOf("dddd") >= 0) {
            formatted = formatted.replace("dddd", this.#longDays[dateTime.getDay()]);
        } else if (formatted.indexOf("ddd") >= 0) {
            formatted = formatted.replace("ddd", this.#shortDays[dateTime.getDay()]);
        }
        return formatted;
    }
    toStringWithSignificantDigits(milli, sigFig) {
        return String(milli).padStart(3, "0").substr(0, sigFig);
    }
}
function getReferenceKey(keys, cutoff) {
    return keys.slice(0, cutoff).join(".") || ".";
}
function getCutoff(array, value) {
    const { length  } = array;
    for(let index1 = 0; index1 < length; ++index1){
        if (array[index1] === value) {
            return index1 + 1;
        }
    }
    return 0;
}
function createReplacer(options) {
    const hasReplacer = typeof options?.replacer === "function";
    const hasCircularReplacer = typeof options?.circularReplacer === "function";
    const cache = [];
    const keys = [];
    return function replace(key, value) {
        const originalValue = this[key];
        if (typeof value === "object") {
            if (cache.length) {
                const thisCutoff = getCutoff(cache, this);
                if (thisCutoff === 0) {
                    cache[cache.length] = this;
                } else {
                    cache.splice(thisCutoff);
                    keys.splice(thisCutoff);
                }
                keys[keys.length] = key;
                const valueCutoff = getCutoff(cache, value);
                if (valueCutoff !== 0) {
                    return hasCircularReplacer ? options.circularReplacer.call(this, key, value, getReferenceKey(keys, valueCutoff)) : `[ref=${getReferenceKey(keys, valueCutoff)}]`;
                }
            } else {
                cache[0] = value;
                keys[0] = key;
            }
            if (value instanceof Set) {
                return Array.from(value.values());
            } else if (value instanceof Map) {
                return Array.from(value.entries());
            } else if (value instanceof RegExp) {
                return {
                    regExpSource: value.source,
                    flags: value.flags
                };
            } else if (value instanceof Error) {
                return options?.suppressErrorStack ? value.name + ": " + value.message : value.stack;
            }
        } else if (typeof value === "undefined") {
            return "undefined";
        } else if (value === Infinity) {
            return "Infinity";
        } else if (value === -Infinity) {
            return "-Infinity";
        } else if (value !== value) {
            return "NaN";
        } else if (typeof value === "bigint") {
            return value.toString();
        } else if (typeof value === "symbol") {
            return String(value);
        } else if (typeof value === "function") {
            return "[function]";
        } else if (originalValue instanceof Date && options?.dateTimeFormatter) {
            return options.dateTimeFormatter.formatDateTime(originalValue);
        }
        return hasReplacer ? options.replacer.call(this, key, value) : value;
    };
}
function stringify(value, options) {
    return JSON.stringify(value, createReplacer(options), options?.indent);
}
function asString(data) {
    if (typeof data === "string") {
        return data;
    } else if (data === null || typeof data === "number" || typeof data === "bigint" || typeof data === "boolean" || typeof data === "undefined") {
        return `${data}`;
    } else if (typeof data === "symbol") {
        return String(data);
    } else if (typeof data === "function") {
        return "[function]";
    } else if (data instanceof Date) {
        return data.toISOString();
    } else if (data instanceof Error) {
        return data.stack ? data.stack : "[" + data.name + "]";
    } else if (typeof data === "object") {
        try {
            return stringify(data);
        } catch (err) {
            return "[Unable to stringify()]";
        }
    }
    return "undefined";
}
const noColor = globalThis.Deno?.noColor ?? true;
let enabled = !noColor;
function code3(open, close) {
    return {
        open: `\x1b[${open.join(";")}m`,
        close: `\x1b[${close}m`,
        regexp: new RegExp(`\\x1b\\[${close}m`, "g")
    };
}
function run(str, code4) {
    return enabled ? `${code4.open}${str.replace(code4.regexp, code4.open)}${code4.close}` : str;
}
function bold(str) {
    return run(str, code3([
        1
    ], 22));
}
function red(str) {
    return run(str, code3([
        31
    ], 39));
}
function yellow(str) {
    return run(str, code3([
        33
    ], 39));
}
function blue(str) {
    return run(str, code3([
        34
    ], 39));
}
function gray(str) {
    return brightBlack(str);
}
function brightBlack(str) {
    return run(str, code3([
        90
    ], 39));
}
const ANSI_PATTERN = new RegExp([
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))", 
].join("|"), "g");
const colorRules = new Map();
colorRules.set(Level.Debug, (msg)=>gray(msg)
);
colorRules.set(Level.Info, (msg)=>blue(msg)
);
colorRules.set(Level.Warn, (msg)=>yellow(msg)
);
colorRules.set(Level.Error, (msg)=>red(msg)
);
colorRules.set(Level.Critical, (msg)=>bold(red(msg))
);
function getColorForLevel(level) {
    const color = colorRules.get(level);
    return color ? color : (msg)=>msg
    ;
}
class TokenReplacer {
    #validTokens = [
        "{dateTime}",
        "{level}",
        "{msg}",
        "{metadata}",
        "{logger}"
    ];
    #formatString = "{dateTime} {level} {msg} {metadata}";
    #levelPadding = 0;
    #withColor = false;
    #dateTimeFormatter = {
        formatDateTime: (date)=>date.toISOString()
    };
    constructor(){
        this.#levelPadding = longestLevelName();
    }
    get formatString() {
        return this.#formatString;
    }
    get levelPadding() {
        return this.#levelPadding;
    }
    isColor() {
        return this.#withColor;
    }
    withLevelPadding(padding) {
        this.#levelPadding = padding;
        return this;
    }
    withFormat(tokenString) {
        const matches = tokenString.match(/{([^{].+?)}/g);
        if (matches) {
            for(let i = 0; i < matches.length; i++){
                if (this.#validTokens.indexOf(matches[i]) < 0) {
                    throw new ValidationError(`${matches[i]} is not a valid token`);
                }
            }
        } else {
            throw new ValidationError("No matching tokens found in " + tokenString);
        }
        this.#formatString = tokenString;
        return this;
    }
    withDateTimeFormat(dtf) {
        if (typeof dtf === "string") {
            dtf = new SimpleDateTimeFormatter(dtf);
        } else if (typeof dtf === "function") {
            dtf = {
                formatDateTime: dtf
            };
        }
        this.#dateTimeFormatter = dtf;
        return this;
    }
    withColor(on) {
        if (on === undefined) this.#withColor = true;
        else this.#withColor = on;
        return this;
    }
    format(logRecord) {
        let formattedMsg = this.#formatString;
        formattedMsg = formattedMsg.replace("{dateTime}", this.#dateTimeFormatter.formatDateTime(logRecord.dateTime));
        formattedMsg = formattedMsg.replace("{level}", levelToName(logRecord.level)?.padEnd(this.#levelPadding, " ") || "UNKNOWN");
        formattedMsg = formattedMsg.replace("{msg}", asString(logRecord.msg));
        let metadataReplacement = "";
        if (logRecord.metadata.length > 0) {
            for (const metaItem of logRecord.metadata){
                metadataReplacement += asString(metaItem) + " ";
            }
            metadataReplacement = metadataReplacement.slice(0, -1);
        }
        formattedMsg = formattedMsg.replace("{metadata}", metadataReplacement);
        formattedMsg = formattedMsg.replace("{logger}", logRecord.logger);
        if (this.#withColor && globalThis.Deno) {
            const colorize = getColorForLevel(logRecord.level);
            formattedMsg = colorize ? colorize(formattedMsg) : formattedMsg;
        }
        return formattedMsg;
    }
}
class ConsoleStream extends BaseStream {
    #started = new Date();
    constructor(){
        super(new TokenReplacer().withColor());
    }
    log(msg) {
        console.log(msg);
    }
}
class ImmutableLogRecord {
    msg;
    #metadata;
    #dateTime;
    level;
    logger;
    constructor(msg1, metadata1, level1, name2){
        this.msg = msg1;
        this.#metadata = [
            ...metadata1
        ];
        this.level = level1;
        this.#dateTime = new Date();
        this.logger = name2;
    }
    get metadata() {
        return [
            ...this.#metadata
        ];
    }
    get dateTime() {
        return new Date(this.#dateTime.getTime());
    }
}
class LogMetaImpl {
    minLogLevel = Level.Debug;
    minLogLevelFrom = "default";
    sessionStarted = new Date();
    hostname = "unavailable";
    logger = "default";
    filters = 0;
    transformers = 0;
    monitors = 0;
    streamStats = new Map();
    toRecord(stream) {
        const record = {
            sessionStarted: this.sessionStarted,
            sessionEnded: this.sessionEnded,
            minLogLevel: levelToName(this.minLogLevel),
            minLogLevelFrom: this.minLogLevelFrom,
            loggerName: this.logger,
            filtersRegistered: this.filters,
            transformersRegistered: this.transformers,
            monitorsRegistered: this.monitors,
            streamName: stream.constructor.name
        };
        const streamStats = this.streamStats.get(stream);
        if (streamStats) {
            record.logRecordsHandled = Array.from(streamStats.handled.keys()).map((k)=>levelToName(k) + ": " + streamStats.handled.get(k)
            ).join(", ");
            record.recordsFiltered = streamStats.filtered;
            record.recordsTransformed = streamStats.transformed;
            if (streamStats.duplicated > 0) {
                record.duplicatedRecords = streamStats.duplicated;
            }
        }
        return record;
    }
}
class RateLimiter {
    #contexts = new Map();
    isRateLimited(rlc, level) {
        const context = rlc.getContext(level);
        const contextState = this.#contexts.get(context);
        if (contextState === undefined) {
            if (rlc.unit) {
                this.#contexts.set(context, new Date().getTime() + rlc.unit.getMilliseconds() * rlc.amount);
            } else {
                this.#contexts.set(context, 0);
            }
            return false;
        } else if (rlc.unit) {
            if (new Date().getTime() > contextState) {
                this.#contexts.set(context, new Date().getTime() + rlc.unit.getMilliseconds() * rlc.amount);
                return false;
            }
            return true;
        } else {
            if (contextState + 1 === rlc.amount) {
                this.#contexts.set(context, 0);
                return false;
            }
            this.#contexts.set(context, contextState + 1);
            return true;
        }
    }
    getContexts() {
        return this.#contexts;
    }
}
class RateLimitContext {
    amount;
    unit;
    context;
    constructor(amount1, unit1, context1){
        this.amount = amount1;
        this.unit = unit1;
        this.context = context1;
    }
    getContext(level) {
        return "" + this.amount + (this.unit ? "." + this.unit.getMilliseconds() : "") + (this.context ? "." + this.context : "") + "." + level;
    }
}
class Dedupe {
    #streams;
    #meta;
    #lastLogRecord = new ImmutableLogRecord(undefined, [], 0, "");
    #lastLogString = "";
    #dupeCount = 0;
    constructor(streams, meta){
        this.#streams = streams;
        this.#meta = meta;
    }
    isDuplicate(logRecord) {
        const thisLogAsString = asString(logRecord.msg) + asString(logRecord.metadata);
        if (this.#lastLogString === thisLogAsString) {
            this.#dupeCount++;
            return true;
        } else {
            this.outputDuplicatedMessageLog();
            this.#lastLogString = thisLogAsString;
            this.#lastLogRecord = logRecord;
            return false;
        }
    }
    destroy() {
        this.outputDuplicatedMessageLog();
    }
    outputDuplicatedMessageLog() {
        if (this.#dupeCount > 0) {
            const duplicateLogRecord = this.generateDuplicateLogRecord(this.#lastLogRecord);
            for(let i = 0; i < this.#streams.length; i++){
                const stream = this.#streams[i];
                const handled = stream.handle(duplicateLogRecord);
                if (handled) {
                    this.#meta.streamStats.get(stream).duplicated += this.#dupeCount;
                }
            }
            this.#dupeCount = 0;
        }
    }
    generateDuplicateLogRecord(logRecord) {
        if (this.#dupeCount === 1) {
            return logRecord;
        }
        return new ImmutableLogRecord("  ^-- last log repeated " + this.#dupeCount + " additional times", [], logRecord.level, logRecord.logger);
    }
}
const defaultStream = new ConsoleStream();
class Logger {
    #name = "default";
    #minLevel = Level.Debug;
    #streams = [
        defaultStream
    ];
    #filters = [];
    #monitors = [];
    #transformers = [];
    #streamAdded = false;
    #meta = new LogMetaImpl();
    #ifCondition = true;
    #enabled = true;
    #rateLimiter = new RateLimiter();
    #rateLimitContext = null;
    #deduper = null;
    #shouldDedupe = false;
    constructor(name1){
        if (name1) {
            this.#name = name1;
            this.#meta.logger = name1;
        }
        this.#meta.streamStats.set(defaultStream, {
            handled: new Map(),
            filtered: 0,
            transformed: 0,
            duplicated: 0
        });
        this.setMinLogLevel();
        addEventListener("unload", ()=>{
            this.#deduper?.destroy();
            this.#meta.sessionEnded = new Date();
            for (const stream of this.#streams){
                if (stream.logFooter && this.#streamAdded && this.#enabled) {
                    stream.logFooter(this.#meta);
                }
                if (stream.destroy) stream.destroy();
            }
            for (const monitor of this.#monitors){
                if (monitor.destroy) monitor.destroy();
            }
            for (const filter of this.#filters){
                if (filter.destroy) filter.destroy();
            }
            for (const transformer of this.#transformers){
                if (transformer.destroy) transformer.destroy();
            }
        });
    }
    setMinLogLevel() {
        const argMinLevel = this.getArgsMinLevel();
        if (argMinLevel !== undefined && nameToLevel(argMinLevel) !== undefined) {
            this.#minLevel = nameToLevel(argMinLevel);
            this.#meta.minLogLevelFrom = "from command line argument";
            this.#meta.minLogLevel = this.#minLevel;
        } else {
            const envMinLevel = this.getEnvMinLevel();
            if (envMinLevel && nameToLevel(envMinLevel) !== undefined) {
                this.#minLevel = nameToLevel(envMinLevel);
                this.#meta.minLogLevelFrom = "from environment variable";
                this.#meta.minLogLevel = this.#minLevel;
            }
        }
    }
    minLogLevel() {
        return this.#minLevel;
    }
    withMinLogLevel(level) {
        if (!this.#enabled) return this;
        this.#minLevel = level;
        this.#meta.minLogLevelFrom = "programmatically set";
        this.#meta.minLogLevel = this.#minLevel;
        return this;
    }
    name() {
        return this.#name;
    }
    addStream(stream) {
        if (!this.#enabled) return this;
        if (!this.#streamAdded) {
            this.#streams = [];
            this.#streamAdded = true;
        }
        this.#streams.push(stream);
        if (stream.setup) stream.setup();
        if (stream.logHeader) stream.logHeader(this.#meta);
        this.#meta.streamStats.set(stream, {
            handled: new Map(),
            filtered: 0,
            transformed: 0,
            duplicated: 0
        });
        return this;
    }
    removeStream(removeStream) {
        if (!this.#enabled) return this;
        this.#streams = this.#streams.filter((stream)=>stream !== removeStream
        );
        if (removeStream.logFooter) removeStream.logFooter(this.#meta);
        if (removeStream.destroy) removeStream.destroy();
        return this;
    }
    addMonitor(monitor) {
        if (!this.#enabled) return this;
        if (typeof monitor === "function") {
            monitor = {
                check: monitor
            };
        }
        if (monitor.setup) monitor.setup();
        this.#monitors.push(monitor);
        this.#meta.monitors++;
        return this;
    }
    removeMonitor(monitorToRemove) {
        if (!this.#enabled) return this;
        this.#monitors = this.#monitors.filter((monitor)=>monitor !== monitorToRemove
        );
        if (monitorToRemove.destroy) monitorToRemove.destroy();
        return this;
    }
    addFilter(filter) {
        if (!this.#enabled) return this;
        if (typeof filter === "function") {
            filter = {
                shouldFilterOut: filter
            };
        }
        if (filter.setup) filter.setup();
        this.#filters.push(filter);
        this.#meta.filters++;
        return this;
    }
    removeFilter(filterToRemove) {
        if (!this.#enabled) return this;
        this.#filters = this.#filters.filter((filter)=>filter !== filterToRemove
        );
        if (filterToRemove.destroy) filterToRemove.destroy();
        return this;
    }
    addTransformer(transformer) {
        if (!this.#enabled) return this;
        if (typeof transformer === "function") {
            transformer = {
                transform: transformer
            };
        }
        if (transformer.setup) transformer.setup();
        this.#transformers.push(transformer);
        this.#meta.transformers++;
        return this;
    }
    removeTransformer(transformerToRemove) {
        if (!this.#enabled) return this;
        this.#transformers = this.#transformers.filter((transformer)=>transformer !== transformerToRemove
        );
        if (transformerToRemove.destroy) transformerToRemove.destroy();
        return this;
    }
    getArgsMinLevel() {
        for(let i = 0; i < this.getArgs().length; i++){
            const arg = this.getArgs()[i];
            if (arg.startsWith("minLogLevel=")) {
                return arg.slice("minLogLevel=".length);
            }
        }
        return undefined;
    }
    getEnvMinLevel() {
        try {
            return this.getEnv().get("OPTIC_MIN_LEVEL");
        } catch (err) {
            return undefined;
        }
    }
    logToStreams(level, msg, metadata) {
        if (!this.#enabled || this.loggingBlocked(level)) {
            this.#ifCondition = true;
            this.#rateLimitContext = null;
            return msg instanceof Function ? undefined : msg;
        }
        this.#rateLimitContext = null;
        const resolvedMsg = msg instanceof Function ? msg() : msg;
        let logRecord = new ImmutableLogRecord(resolvedMsg, metadata, level, this.#name);
        for(let i = 0; i < this.#monitors.length; i++){
            this.#monitors[i].check(logRecord);
        }
        for(let i1 = 0; i1 < this.#streams.length; i1++){
            const stream = this.#streams[i1];
            let skip = false;
            for(let j = 0; !skip && j < this.#filters.length; j++){
                if (this.#filters[j].shouldFilterOut(stream, logRecord)) {
                    skip = true;
                    this.#meta.streamStats.get(stream).filtered++;
                }
            }
            if (!skip) {
                if (this.#transformers.length > 0) {
                    for(let j1 = 0; !skip && j1 < this.#transformers.length; j1++){
                        let thisLogRecord = logRecord;
                        thisLogRecord = this.#transformers[j1].transform(stream, thisLogRecord);
                        if (logRecord !== thisLogRecord) {
                            logRecord = thisLogRecord;
                            this.#meta.streamStats.get(stream).transformed++;
                        }
                    }
                    if (!this.#shouldDedupe || !this.#deduper?.isDuplicate(logRecord)) {
                        const handled = stream.handle(logRecord);
                        if (handled) {
                            this.registerStreamHandlingOfLogRecord(stream, level);
                        }
                    }
                } else {
                    if (!this.#shouldDedupe || !this.#deduper?.isDuplicate(logRecord)) {
                        const handled = stream.handle(logRecord);
                        if (handled) {
                            this.registerStreamHandlingOfLogRecord(stream, level);
                        }
                    }
                }
            }
        }
        return resolvedMsg;
    }
    registerStreamHandlingOfLogRecord(stream, level) {
        if (!this.#meta.streamStats.get(stream).handled.has(level)) {
            this.#meta.streamStats.get(stream).handled.set(level, 0);
        }
        this.#meta.streamStats.get(stream).handled.set(level, this.#meta.streamStats.get(stream).handled.get(level) + 1);
    }
    trace(msg, ...metadata) {
        return this.logToStreams(Level.Trace, msg, metadata);
    }
    debug(msg, ...metadata) {
        return this.logToStreams(Level.Debug, msg, metadata);
    }
    info(msg, ...metadata) {
        return this.logToStreams(Level.Info, msg, metadata);
    }
    warn(msg, ...metadata) {
        return this.logToStreams(Level.Warn, msg, metadata);
    }
    error(msg, ...metadata) {
        return this.logToStreams(Level.Error, msg, metadata);
    }
    critical(msg, ...metadata) {
        return this.logToStreams(Level.Critical, msg, metadata);
    }
    log(level, msg, ...metadata) {
        return this.logToStreams(level, msg, metadata);
    }
    if(condition) {
        this.#ifCondition = condition;
        return this;
    }
    enabled(condition) {
        this.#enabled = condition;
        return this;
    }
    atMostEvery(amount, unit, context) {
        if (!this.#enabled) return this;
        this.#rateLimitContext = new RateLimitContext(amount, unit, context);
        return this;
    }
    every(amount, context) {
        if (!this.#enabled) return this;
        this.#rateLimitContext = new RateLimitContext(amount, undefined, context);
        return this;
    }
    withDedupe(shouldDedupe) {
        if (!this.#enabled) return this;
        if (shouldDedupe || shouldDedupe === undefined) {
            this.#deduper = new Dedupe(this.#streams, this.#meta);
            this.#shouldDedupe = true;
        } else {
            if (this.#deduper) {
                this.#deduper.destroy();
            }
            this.#shouldDedupe = false;
            this.#deduper = null;
        }
        return this;
    }
    getArgs() {
        return Deno.args ?? [];
    }
    getEnv() {
        return Deno.env;
    }
    loggingBlocked(level) {
        if (this.#minLevel > level || !this.#ifCondition) {
            return true;
        }
        if (this.#rateLimitContext && this.#rateLimiter.isRateLimited(this.#rateLimitContext, level)) {
            return true;
        }
        return false;
    }
}
function loggerWithContext(ctx) {
    return new Logger().addStream(new ConsoleStream().withLogHeader(false).withLogFooter(false).withFormat(new TokenReplacer().withFormat(`{dateTime} [{level}][${ctx}] {msg} {metadata}`).withDateTimeFormat("YYYY-MM-DD hh:mm:ss").withLevelPadding(0).withColor(false)));
}
function NonEmptyString() {
    return Type.String({
        minLength: 1
    });
}
const FdbDatabaseConfigSchema = RelaxedObject({
    storageEngine: Type.Union([
        Type.Literal("ssd-2"),
        Type.Literal("ssd-redwood-experimental"), 
    ]),
    redundancyMode: Type.Union([
        Type.Literal("single"),
        Type.Literal("double"),
        Type.Literal("triple"), 
    ]),
    logCount: Type.Number({
        minimum: 1
    }),
    proxyCount: Type.Number({
        minimum: 1
    }),
    resolverCount: Type.Number({
        minimum: 1
    }),
    coordinatorServiceNames: Type.Array(Type.String()),
    excludedServiceEndpoints: Type.Array(RelaxedObject({
        name: Type.String(),
        port: Type.Number({
            minimum: 1,
            maximum: 65535
        })
    }))
});
function RelaxedObject(properties2) {
    return Type.Object(properties2, {
        additionalProperties: true
    });
}
const FdbStatusProcessSchema = RelaxedObject({
    address: Type.String(),
    excluded: Type.Optional(Type.Boolean()),
    machine_id: Type.Optional(Type.String()),
    class_type: Type.Union([
        Type.Literal("unset"),
        Type.Literal("coordinator"),
        Type.Literal("storage"),
        Type.Literal("transaction"),
        Type.Literal("stateless"),
        Type.Literal("proxy"),
        Type.Literal("log"),
        Type.Literal("master"), 
    ])
});
const FdbStatusSchema = RelaxedObject({
    cluster: RelaxedObject({
        configuration: Type.Optional(RelaxedObject({
            resolvers: Type.Number(),
            proxies: Type.Number(),
            logs: Type.Number(),
            redundancy_mode: FdbDatabaseConfigSchema.properties.redundancyMode,
            storage_engine: FdbDatabaseConfigSchema.properties.storageEngine
        })),
        recovery_state: Type.Optional(RelaxedObject({
            name: Type.String(),
            description: Type.String()
        })),
        processes: Type.Optional(Type.Dict(FdbStatusProcessSchema))
    }),
    client: RelaxedObject({
        database_status: RelaxedObject({
            available: Type.Boolean()
        }),
        coordinators: RelaxedObject({
            quorum_reachable: Type.Boolean(),
            coordinators: Type.Array(RelaxedObject({
                address: Type.String(),
                reachable: Type.Boolean()
            }))
        })
    })
});
function copy(src, dst, off = 0) {
    off = Math.max(0, Math.min(off, dst.byteLength));
    const dstBytesAvailable = dst.byteLength - off;
    if (src.byteLength > dstBytesAvailable) {
        src = src.subarray(0, dstBytesAvailable);
    }
    dst.set(src, off);
    return src.byteLength;
}
const MIN_READ = 32 * 1024;
const MAX_SIZE = 2 ** 32 - 2;
function copyBytes(src, dst, off = 0) {
    const r = dst.byteLength - off;
    if (src.byteLength > r) {
        src = src.subarray(0, r);
    }
    dst.set(src, off);
    return src.byteLength;
}
class Buffer {
    #buf;
    #off = 0;
    constructor(ab){
        if (ab === undefined) {
            this.#buf = new Uint8Array(0);
            return;
        }
        this.#buf = new Uint8Array(ab);
    }
    bytes(options = {
        copy: true
    }) {
        if (options.copy === false) return this.#buf.subarray(this.#off);
        return this.#buf.slice(this.#off);
    }
    empty() {
        return this.#buf.byteLength <= this.#off;
    }
    get length() {
        return this.#buf.byteLength - this.#off;
    }
    get capacity() {
        return this.#buf.buffer.byteLength;
    }
    truncate(n) {
        if (n === 0) {
            this.reset();
            return;
        }
        if (n < 0 || n > this.length) {
            throw Error("bytes.Buffer: truncation out of range");
        }
        this.#reslice(this.#off + n);
    }
    reset() {
        this.#reslice(0);
        this.#off = 0;
    }
    #tryGrowByReslice = (n)=>{
        const l = this.#buf.byteLength;
        if (n <= this.capacity - l) {
            this.#reslice(l + n);
            return l;
        }
        return -1;
    };
    #reslice = (len)=>{
        assert(len <= this.#buf.buffer.byteLength);
        this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
    };
    readSync(p) {
        if (this.empty()) {
            this.reset();
            if (p.byteLength === 0) {
                return 0;
            }
            return null;
        }
        const nread = copyBytes(this.#buf.subarray(this.#off), p);
        this.#off += nread;
        return nread;
    }
    read(p) {
        const rr = this.readSync(p);
        return Promise.resolve(rr);
    }
    writeSync(p) {
        const m = this.#grow(p.byteLength);
        return copyBytes(p, this.#buf, m);
    }
    write(p) {
        const n = this.writeSync(p);
        return Promise.resolve(n);
    }
    #grow = (n)=>{
        const m = this.length;
        if (m === 0 && this.#off !== 0) {
            this.reset();
        }
        const i = this.#tryGrowByReslice(n);
        if (i >= 0) {
            return i;
        }
        const c = this.capacity;
        if (n <= Math.floor(c / 2) - m) {
            copyBytes(this.#buf.subarray(this.#off), this.#buf);
        } else if (c + n > MAX_SIZE) {
            throw new Error("The buffer cannot be grown beyond the maximum size.");
        } else {
            const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
            copyBytes(this.#buf.subarray(this.#off), buf);
            this.#buf = buf;
        }
        this.#off = 0;
        this.#reslice(Math.min(m + n, MAX_SIZE));
        return m;
    };
    grow(n) {
        if (n < 0) {
            throw Error("Buffer.grow: negative count");
        }
        const m = this.#grow(n);
        this.#reslice(m);
    }
    async readFrom(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = await r.read(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
    readFromSync(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = r.readSync(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
}
async function writeAll(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += await w.write(arr.subarray(nwritten));
    }
}
function writeAllSync(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += w.writeSync(arr.subarray(nwritten));
    }
}
const DEFAULT_BUF_SIZE = 4096;
const MIN_BUF_SIZE = 16;
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
class BufferFullError extends Error {
    partial;
    name = "BufferFullError";
    constructor(partial1){
        super("Buffer full");
        this.partial = partial1;
    }
}
class PartialReadError extends Error {
    name = "PartialReadError";
    partial;
    constructor(){
        super("Encountered UnexpectedEof, data only partially read");
    }
}
class BufReader {
    buf;
    rd;
    r = 0;
    w = 0;
    eof = false;
    static create(r, size = 4096) {
        return r instanceof BufReader ? r : new BufReader(r, size);
    }
    constructor(rd1, size1 = 4096){
        if (size1 < 16) {
            size1 = MIN_BUF_SIZE;
        }
        this._reset(new Uint8Array(size1), rd1);
    }
    size() {
        return this.buf.byteLength;
    }
    buffered() {
        return this.w - this.r;
    }
    async _fill() {
        if (this.r > 0) {
            this.buf.copyWithin(0, this.r, this.w);
            this.w -= this.r;
            this.r = 0;
        }
        if (this.w >= this.buf.byteLength) {
            throw Error("bufio: tried to fill full buffer");
        }
        for(let i = 100; i > 0; i--){
            const rr = await this.rd.read(this.buf.subarray(this.w));
            if (rr === null) {
                this.eof = true;
                return;
            }
            assert(rr >= 0, "negative read");
            this.w += rr;
            if (rr > 0) {
                return;
            }
        }
        throw new Error(`No progress after ${100} read() calls`);
    }
    reset(r) {
        this._reset(this.buf, r);
    }
    _reset(buf, rd) {
        this.buf = buf;
        this.rd = rd;
        this.eof = false;
    }
    async read(p) {
        let rr = p.byteLength;
        if (p.byteLength === 0) return rr;
        if (this.r === this.w) {
            if (p.byteLength >= this.buf.byteLength) {
                const rr1 = await this.rd.read(p);
                const nread = rr1 ?? 0;
                assert(nread >= 0, "negative read");
                return rr1;
            }
            this.r = 0;
            this.w = 0;
            rr = await this.rd.read(this.buf);
            if (rr === 0 || rr === null) return rr;
            assert(rr >= 0, "negative read");
            this.w += rr;
        }
        const copied = copy(this.buf.subarray(this.r, this.w), p, 0);
        this.r += copied;
        return copied;
    }
    async readFull(p) {
        let bytesRead = 0;
        while(bytesRead < p.length){
            try {
                const rr = await this.read(p.subarray(bytesRead));
                if (rr === null) {
                    if (bytesRead === 0) {
                        return null;
                    } else {
                        throw new PartialReadError();
                    }
                }
                bytesRead += rr;
            } catch (err) {
                err.partial = p.subarray(0, bytesRead);
                throw err;
            }
        }
        return p;
    }
    async readByte() {
        while(this.r === this.w){
            if (this.eof) return null;
            await this._fill();
        }
        const c = this.buf[this.r];
        this.r++;
        return c;
    }
    async readString(delim) {
        if (delim.length !== 1) {
            throw new Error("Delimiter should be a single character");
        }
        const buffer = await this.readSlice(delim.charCodeAt(0));
        if (buffer === null) return null;
        return new TextDecoder().decode(buffer);
    }
    async readLine() {
        let line;
        try {
            line = await this.readSlice(LF);
        } catch (err) {
            let { partial: partial2  } = err;
            assert(partial2 instanceof Uint8Array, "bufio: caught error from `readSlice()` without `partial` property");
            if (!(err instanceof BufferFullError)) {
                throw err;
            }
            if (!this.eof && partial2.byteLength > 0 && partial2[partial2.byteLength - 1] === CR) {
                assert(this.r > 0, "bufio: tried to rewind past start of buffer");
                this.r--;
                partial2 = partial2.subarray(0, partial2.byteLength - 1);
            }
            return {
                line: partial2,
                more: !this.eof
            };
        }
        if (line === null) {
            return null;
        }
        if (line.byteLength === 0) {
            return {
                line,
                more: false
            };
        }
        if (line[line.byteLength - 1] == LF) {
            let drop = 1;
            if (line.byteLength > 1 && line[line.byteLength - 2] === CR) {
                drop = 2;
            }
            line = line.subarray(0, line.byteLength - drop);
        }
        return {
            line,
            more: false
        };
    }
    async readSlice(delim) {
        let s = 0;
        let slice;
        while(true){
            let i = this.buf.subarray(this.r + s, this.w).indexOf(delim);
            if (i >= 0) {
                i += s;
                slice = this.buf.subarray(this.r, this.r + i + 1);
                this.r += i + 1;
                break;
            }
            if (this.eof) {
                if (this.r === this.w) {
                    return null;
                }
                slice = this.buf.subarray(this.r, this.w);
                this.r = this.w;
                break;
            }
            if (this.buffered() >= this.buf.byteLength) {
                this.r = this.w;
                const oldbuf = this.buf;
                const newbuf = this.buf.slice(0);
                this.buf = newbuf;
                throw new BufferFullError(oldbuf);
            }
            s = this.w - this.r;
            try {
                await this._fill();
            } catch (err) {
                err.partial = slice;
                throw err;
            }
        }
        return slice;
    }
    async peek(n) {
        if (n < 0) {
            throw Error("negative count");
        }
        let avail = this.w - this.r;
        while(avail < n && avail < this.buf.byteLength && !this.eof){
            try {
                await this._fill();
            } catch (err) {
                err.partial = this.buf.subarray(this.r, this.w);
                throw err;
            }
            avail = this.w - this.r;
        }
        if (avail === 0 && this.eof) {
            return null;
        } else if (avail < n && this.eof) {
            return this.buf.subarray(this.r, this.r + avail);
        } else if (avail < n) {
            throw new BufferFullError(this.buf.subarray(this.r, this.w));
        }
        return this.buf.subarray(this.r, this.r + n);
    }
}
class AbstractBufBase {
    buf;
    usedBufferBytes = 0;
    err = null;
    size() {
        return this.buf.byteLength;
    }
    available() {
        return this.buf.byteLength - this.usedBufferBytes;
    }
    buffered() {
        return this.usedBufferBytes;
    }
}
class BufWriter extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriter ? writer : new BufWriter(writer, size);
    }
    constructor(writer1, size2 = 4096){
        super();
        this.writer = writer1;
        if (size2 <= 0) {
            size2 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size2);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    async flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            await writeAll(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    async write(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = await this.writer.write(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                await this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
class BufWriterSync extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriterSync ? writer : new BufWriterSync(writer, size);
    }
    constructor(writer2, size3 = 4096){
        super();
        this.writer = writer2;
        if (size3 <= 0) {
            size3 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size3);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            writeAllSync(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    writeSync(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = this.writer.writeSync(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
function createLPS(pat) {
    const lps = new Uint8Array(pat.length);
    lps[0] = 0;
    let prefixEnd = 0;
    let i = 1;
    while(i < lps.length){
        if (pat[i] == pat[prefixEnd]) {
            prefixEnd++;
            lps[i] = prefixEnd;
            i++;
        } else if (prefixEnd === 0) {
            lps[i] = 0;
            i++;
        } else {
            prefixEnd = pat[prefixEnd - 1];
        }
    }
    return lps;
}
async function* readDelim(reader, delim) {
    const delimLen = delim.length;
    const delimLPS = createLPS(delim);
    let inputBuffer = new Buffer();
    const inspectArr = new Uint8Array(Math.max(1024, delimLen + 1));
    let inspectIndex = 0;
    let matchIndex = 0;
    while(true){
        const result = await reader.read(inspectArr);
        if (result === null) {
            yield inputBuffer.bytes();
            return;
        }
        if (result < 0) {
            return;
        }
        const sliceRead = inspectArr.subarray(0, result);
        await writeAll(inputBuffer, sliceRead);
        let sliceToProcess = inputBuffer.bytes();
        while(inspectIndex < sliceToProcess.length){
            if (sliceToProcess[inspectIndex] === delim[matchIndex]) {
                inspectIndex++;
                matchIndex++;
                if (matchIndex === delimLen) {
                    const matchEnd = inspectIndex - delimLen;
                    const readyBytes = sliceToProcess.subarray(0, matchEnd);
                    const pendingBytes = sliceToProcess.slice(inspectIndex);
                    yield readyBytes;
                    sliceToProcess = pendingBytes;
                    inspectIndex = 0;
                    matchIndex = 0;
                }
            } else {
                if (matchIndex === 0) {
                    inspectIndex++;
                } else {
                    matchIndex = delimLPS[matchIndex - 1];
                }
            }
        }
        inputBuffer = new Buffer(sliceToProcess);
    }
}
async function* readStringDelim(reader, delim) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    for await (const chunk of readDelim(reader, encoder.encode(delim))){
        yield decoder.decode(chunk);
    }
}
async function* readLines(reader) {
    for await (let chunk of readStringDelim(reader, "\n")){
        if (chunk.endsWith("\r")) {
            chunk = chunk.slice(0, -1);
        }
        yield chunk;
    }
}
const ansiPattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))", 
].join("|");
const ansiRegex = new RegExp(ansiPattern, "g");
function stripAnsi(s) {
    return s.replace(ansiRegex, "").split("").filter((x)=>{
        const n = x.charCodeAt(0);
        return 31 < n && 127 > n;
    }).join("");
}
class NonZeroExitError extends Error {
    exitCode;
    output;
    constructor(message3, exitCode, output){
        super(message3);
        this.exitCode = exitCode;
        this.output = output;
        this.name = "NonZeroExitError";
    }
}
async function _inheritExec({ run: run1 , stdin , stdoutTag , stderrTag , ignoreStdout =false , ignoreStderr =false  }) {
    const stdinOpt = stdin !== undefined ? "piped" : "null";
    const child = Deno.run({
        ...run1,
        stdin: stdinOpt,
        stdout: ignoreStdout ? "null" : "piped",
        stderr: ignoreStderr ? "null" : "piped"
    });
    try {
        const stdinPromise = (()=>{
            if (typeof stdin === "string") {
                return writeAll(child.stdin, new TextEncoder().encode(stdin)).finally(()=>child.stdin.close()
                );
            } else if (typeof stdin === "object") {
                return Deno.copy(stdin, child.stdin).then(()=>{
                }).finally(()=>child.stdin.close()
                );
            } else {
                return Promise.resolve();
            }
        })();
        const stdoutPrefix = stdoutTag !== undefined ? stdoutTag + " " : "";
        const stderrPrefix = stderrTag !== undefined ? stderrTag + " " : "";
        const stdoutPromise = ignoreStdout ? Promise.resolve() : (async ()=>{
            for await (const line of readLines(child.stdout)){
                const printableLine = stripAnsi(line);
                if (printableLine.length > 0) {
                    console.log(`${stdoutPrefix}${printableLine}`);
                }
            }
        })();
        const stderrPromise = ignoreStderr ? Promise.resolve() : (async ()=>{
            for await (const line of readLines(child.stderr)){
                const printableLine = stripAnsi(line);
                if (printableLine.length > 0) {
                    console.error(`${stderrPrefix}${printableLine}`);
                }
            }
        })();
        await Promise.all([
            stdinPromise,
            stdoutPromise,
            stderrPromise, 
        ]);
        const { code: code4  } = await child.status();
        return code4;
    } finally{
        if (!ignoreStdout) {
            child.stdout.close();
        }
        if (!ignoreStderr) {
            child.stderr.close();
        }
        child.close();
    }
}
async function inheritExec(args) {
    const code4 = await _inheritExec(args);
    if (code4 !== 0) {
        throw new NonZeroExitError(`Command return non-zero status of: ${code4}`, code4);
    }
}
async function captureExec({ run: run1 , stdin , stderrTag  }) {
    const stdinOpt = stdin !== undefined ? "piped" : "null";
    const child = Deno.run({
        ...run1,
        stdin: stdinOpt,
        stdout: "piped",
        stderr: "piped"
    });
    try {
        const stdinPromise = (()=>{
            if (typeof stdin === "string") {
                return writeAll(child.stdin, new TextEncoder().encode(stdin)).finally(()=>child.stdin.close()
                );
            } else if (typeof stdin === "object") {
                return Deno.copy(stdin, child.stdin).then(()=>{
                }).finally(()=>child.stdin.close()
                );
            } else {
                return Promise.resolve();
            }
        })();
        const stderrPrefix = stderrTag !== undefined ? stderrTag + " " : "";
        const stderrPromise = (async ()=>{
            for await (const line of readLines(child.stderr)){
                const printableLine = stripAnsi(line);
                if (printableLine.length > 0) {
                    console.error(`${stderrPrefix}${printableLine}`);
                }
            }
        })();
        const stdoutPromise = child.output();
        await Promise.all([
            stdinPromise,
            stderrPromise
        ]);
        const { code: code4  } = await child.status();
        const captured = new TextDecoder().decode(await stdoutPromise);
        if (code4 !== 0) {
            throw new NonZeroExitError(`Command return non-zero status of: ${code4}. Captured stdout: ${captured}`, code4, captured);
        }
        return captured;
    } finally{
        child.stderr.close();
        child.close();
    }
}
function delay(ms) {
    return new Promise((res)=>setTimeout(()=>{
            res();
        }, ms)
    );
}
function memoizePromise(create) {
    let memoized = null;
    return ()=>{
        if (!memoized) {
            memoized = create();
        }
        return memoized;
    };
}
class IoK8sApiCoreV1PodSpec {
    "activeDeadlineSeconds";
    "affinity";
    "automountServiceAccountToken";
    "containers";
    "dnsConfig";
    "dnsPolicy";
    "enableServiceLinks";
    "ephemeralContainers";
    "hostAliases";
    "hostIPC";
    "hostNetwork";
    "hostPID";
    "hostname";
    "imagePullSecrets";
    "initContainers";
    "nodeName";
    "nodeSelector";
    "overhead";
    "preemptionPolicy";
    "priority";
    "priorityClassName";
    "readinessGates";
    "restartPolicy";
    "runtimeClassName";
    "schedulerName";
    "securityContext";
    "serviceAccount";
    "serviceAccountName";
    "setHostnameAsFQDN";
    "shareProcessNamespace";
    "subdomain";
    "terminationGracePeriodSeconds";
    "tolerations";
    "topologySpreadConstraints";
    "volumes";
    static discriminator = undefined;
    static attributeTypeMap = [
        {
            "name": "activeDeadlineSeconds",
            "baseName": "activeDeadlineSeconds",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "affinity",
            "baseName": "affinity",
            "type": "IoK8sApiCoreV1Affinity",
            "format": ""
        },
        {
            "name": "automountServiceAccountToken",
            "baseName": "automountServiceAccountToken",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "containers",
            "baseName": "containers",
            "type": "Array<IoK8sApiCoreV1Container>",
            "format": ""
        },
        {
            "name": "dnsConfig",
            "baseName": "dnsConfig",
            "type": "IoK8sApiCoreV1PodDNSConfig",
            "format": ""
        },
        {
            "name": "dnsPolicy",
            "baseName": "dnsPolicy",
            "type": "string",
            "format": ""
        },
        {
            "name": "enableServiceLinks",
            "baseName": "enableServiceLinks",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "ephemeralContainers",
            "baseName": "ephemeralContainers",
            "type": "Array<IoK8sApiCoreV1EphemeralContainer>",
            "format": ""
        },
        {
            "name": "hostAliases",
            "baseName": "hostAliases",
            "type": "Array<IoK8sApiCoreV1HostAlias>",
            "format": ""
        },
        {
            "name": "hostIPC",
            "baseName": "hostIPC",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "hostNetwork",
            "baseName": "hostNetwork",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "hostPID",
            "baseName": "hostPID",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "hostname",
            "baseName": "hostname",
            "type": "string",
            "format": ""
        },
        {
            "name": "imagePullSecrets",
            "baseName": "imagePullSecrets",
            "type": "Array<IoK8sApiCoreV1LocalObjectReference>",
            "format": ""
        },
        {
            "name": "initContainers",
            "baseName": "initContainers",
            "type": "Array<IoK8sApiCoreV1Container>",
            "format": ""
        },
        {
            "name": "nodeName",
            "baseName": "nodeName",
            "type": "string",
            "format": ""
        },
        {
            "name": "nodeSelector",
            "baseName": "nodeSelector",
            "type": "{ [key: string]: string; }",
            "format": ""
        },
        {
            "name": "overhead",
            "baseName": "overhead",
            "type": "{ [key: string]: string; }",
            "format": ""
        },
        {
            "name": "preemptionPolicy",
            "baseName": "preemptionPolicy",
            "type": "string",
            "format": ""
        },
        {
            "name": "priority",
            "baseName": "priority",
            "type": "number",
            "format": "int32"
        },
        {
            "name": "priorityClassName",
            "baseName": "priorityClassName",
            "type": "string",
            "format": ""
        },
        {
            "name": "readinessGates",
            "baseName": "readinessGates",
            "type": "Array<IoK8sApiCoreV1PodReadinessGate>",
            "format": ""
        },
        {
            "name": "restartPolicy",
            "baseName": "restartPolicy",
            "type": "string",
            "format": ""
        },
        {
            "name": "runtimeClassName",
            "baseName": "runtimeClassName",
            "type": "string",
            "format": ""
        },
        {
            "name": "schedulerName",
            "baseName": "schedulerName",
            "type": "string",
            "format": ""
        },
        {
            "name": "securityContext",
            "baseName": "securityContext",
            "type": "IoK8sApiCoreV1PodSecurityContext",
            "format": ""
        },
        {
            "name": "serviceAccount",
            "baseName": "serviceAccount",
            "type": "string",
            "format": ""
        },
        {
            "name": "serviceAccountName",
            "baseName": "serviceAccountName",
            "type": "string",
            "format": ""
        },
        {
            "name": "setHostnameAsFQDN",
            "baseName": "setHostnameAsFQDN",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "shareProcessNamespace",
            "baseName": "shareProcessNamespace",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "subdomain",
            "baseName": "subdomain",
            "type": "string",
            "format": ""
        },
        {
            "name": "terminationGracePeriodSeconds",
            "baseName": "terminationGracePeriodSeconds",
            "type": "number",
            "format": "int64"
        },
        {
            "name": "tolerations",
            "baseName": "tolerations",
            "type": "Array<IoK8sApiCoreV1Toleration>",
            "format": ""
        },
        {
            "name": "topologySpreadConstraints",
            "baseName": "topologySpreadConstraints",
            "type": "Array<IoK8sApiCoreV1TopologySpreadConstraint>",
            "format": ""
        },
        {
            "name": "volumes",
            "baseName": "volumes",
            "type": "Array<IoK8sApiCoreV1Volume>",
            "format": ""
        }, 
    ];
    static getAttributeTypeMap() {
        return IoK8sApiCoreV1PodSpec.attributeTypeMap;
    }
    constructor(){
    }
}
class IoK8sApiCoreV1Volume {
    "awsElasticBlockStore";
    "azureDisk";
    "azureFile";
    "cephfs";
    "cinder";
    "configMap";
    "csi";
    "downwardAPI";
    "emptyDir";
    "ephemeral";
    "fc";
    "flexVolume";
    "flocker";
    "gcePersistentDisk";
    "gitRepo";
    "glusterfs";
    "hostPath";
    "iscsi";
    "name";
    "nfs";
    "persistentVolumeClaim";
    "photonPersistentDisk";
    "portworxVolume";
    "projected";
    "quobyte";
    "rbd";
    "scaleIO";
    "secret";
    "storageos";
    "vsphereVolume";
    static discriminator = undefined;
    static attributeTypeMap = [
        {
            "name": "awsElasticBlockStore",
            "baseName": "awsElasticBlockStore",
            "type": "IoK8sApiCoreV1AWSElasticBlockStoreVolumeSource",
            "format": ""
        },
        {
            "name": "azureDisk",
            "baseName": "azureDisk",
            "type": "IoK8sApiCoreV1AzureDiskVolumeSource",
            "format": ""
        },
        {
            "name": "azureFile",
            "baseName": "azureFile",
            "type": "IoK8sApiCoreV1AzureFileVolumeSource",
            "format": ""
        },
        {
            "name": "cephfs",
            "baseName": "cephfs",
            "type": "IoK8sApiCoreV1CephFSVolumeSource",
            "format": ""
        },
        {
            "name": "cinder",
            "baseName": "cinder",
            "type": "IoK8sApiCoreV1CinderVolumeSource",
            "format": ""
        },
        {
            "name": "configMap",
            "baseName": "configMap",
            "type": "IoK8sApiCoreV1ConfigMapVolumeSource",
            "format": ""
        },
        {
            "name": "csi",
            "baseName": "csi",
            "type": "IoK8sApiCoreV1CSIVolumeSource",
            "format": ""
        },
        {
            "name": "downwardAPI",
            "baseName": "downwardAPI",
            "type": "IoK8sApiCoreV1DownwardAPIVolumeSource",
            "format": ""
        },
        {
            "name": "emptyDir",
            "baseName": "emptyDir",
            "type": "IoK8sApiCoreV1EmptyDirVolumeSource",
            "format": ""
        },
        {
            "name": "ephemeral",
            "baseName": "ephemeral",
            "type": "IoK8sApiCoreV1EphemeralVolumeSource",
            "format": ""
        },
        {
            "name": "fc",
            "baseName": "fc",
            "type": "IoK8sApiCoreV1FCVolumeSource",
            "format": ""
        },
        {
            "name": "flexVolume",
            "baseName": "flexVolume",
            "type": "IoK8sApiCoreV1FlexVolumeSource",
            "format": ""
        },
        {
            "name": "flocker",
            "baseName": "flocker",
            "type": "IoK8sApiCoreV1FlockerVolumeSource",
            "format": ""
        },
        {
            "name": "gcePersistentDisk",
            "baseName": "gcePersistentDisk",
            "type": "IoK8sApiCoreV1GCEPersistentDiskVolumeSource",
            "format": ""
        },
        {
            "name": "gitRepo",
            "baseName": "gitRepo",
            "type": "IoK8sApiCoreV1GitRepoVolumeSource",
            "format": ""
        },
        {
            "name": "glusterfs",
            "baseName": "glusterfs",
            "type": "IoK8sApiCoreV1GlusterfsVolumeSource",
            "format": ""
        },
        {
            "name": "hostPath",
            "baseName": "hostPath",
            "type": "IoK8sApiCoreV1HostPathVolumeSource",
            "format": ""
        },
        {
            "name": "iscsi",
            "baseName": "iscsi",
            "type": "IoK8sApiCoreV1ISCSIVolumeSource",
            "format": ""
        },
        {
            "name": "name",
            "baseName": "name",
            "type": "string",
            "format": ""
        },
        {
            "name": "nfs",
            "baseName": "nfs",
            "type": "IoK8sApiCoreV1NFSVolumeSource",
            "format": ""
        },
        {
            "name": "persistentVolumeClaim",
            "baseName": "persistentVolumeClaim",
            "type": "IoK8sApiCoreV1PersistentVolumeClaimVolumeSource",
            "format": ""
        },
        {
            "name": "photonPersistentDisk",
            "baseName": "photonPersistentDisk",
            "type": "IoK8sApiCoreV1PhotonPersistentDiskVolumeSource",
            "format": ""
        },
        {
            "name": "portworxVolume",
            "baseName": "portworxVolume",
            "type": "IoK8sApiCoreV1PortworxVolumeSource",
            "format": ""
        },
        {
            "name": "projected",
            "baseName": "projected",
            "type": "IoK8sApiCoreV1ProjectedVolumeSource",
            "format": ""
        },
        {
            "name": "quobyte",
            "baseName": "quobyte",
            "type": "IoK8sApiCoreV1QuobyteVolumeSource",
            "format": ""
        },
        {
            "name": "rbd",
            "baseName": "rbd",
            "type": "IoK8sApiCoreV1RBDVolumeSource",
            "format": ""
        },
        {
            "name": "scaleIO",
            "baseName": "scaleIO",
            "type": "IoK8sApiCoreV1ScaleIOVolumeSource",
            "format": ""
        },
        {
            "name": "secret",
            "baseName": "secret",
            "type": "IoK8sApiCoreV1SecretVolumeSource",
            "format": ""
        },
        {
            "name": "storageos",
            "baseName": "storageos",
            "type": "IoK8sApiCoreV1StorageOSVolumeSource",
            "format": ""
        },
        {
            "name": "vsphereVolume",
            "baseName": "vsphereVolume",
            "type": "IoK8sApiCoreV1VsphereVirtualDiskVolumeSource",
            "format": ""
        }, 
    ];
    static getAttributeTypeMap() {
        return IoK8sApiCoreV1Volume.attributeTypeMap;
    }
    constructor(){
    }
}
class IoK8sApiCoreV1VolumeMount {
    "mountPath";
    "mountPropagation";
    "name";
    "readOnly";
    "subPath";
    "subPathExpr";
    static discriminator = undefined;
    static attributeTypeMap = [
        {
            "name": "mountPath",
            "baseName": "mountPath",
            "type": "string",
            "format": ""
        },
        {
            "name": "mountPropagation",
            "baseName": "mountPropagation",
            "type": "string",
            "format": ""
        },
        {
            "name": "name",
            "baseName": "name",
            "type": "string",
            "format": ""
        },
        {
            "name": "readOnly",
            "baseName": "readOnly",
            "type": "boolean",
            "format": ""
        },
        {
            "name": "subPath",
            "baseName": "subPath",
            "type": "string",
            "format": ""
        },
        {
            "name": "subPathExpr",
            "baseName": "subPathExpr",
            "type": "string",
            "format": ""
        }, 
    ];
    static getAttributeTypeMap() {
        return IoK8sApiCoreV1VolumeMount.attributeTypeMap;
    }
    constructor(){
    }
}
class IoK8sApiCoreV1ContainerPort {
    "containerPort";
    "hostIP";
    "hostPort";
    "name";
    "protocol";
    static discriminator = undefined;
    static attributeTypeMap = [
        {
            "name": "containerPort",
            "baseName": "containerPort",
            "type": "number",
            "format": "int32"
        },
        {
            "name": "hostIP",
            "baseName": "hostIP",
            "type": "string",
            "format": ""
        },
        {
            "name": "hostPort",
            "baseName": "hostPort",
            "type": "number",
            "format": "int32"
        },
        {
            "name": "name",
            "baseName": "name",
            "type": "string",
            "format": ""
        },
        {
            "name": "protocol",
            "baseName": "protocol",
            "type": "string",
            "format": ""
        }, 
    ];
    static getAttributeTypeMap() {
        return IoK8sApiCoreV1ContainerPort.attributeTypeMap;
    }
    constructor(){
    }
}
class IoK8sApiCoreV1Probe {
    "exec";
    "failureThreshold";
    "httpGet";
    "initialDelaySeconds";
    "periodSeconds";
    "successThreshold";
    "tcpSocket";
    "timeoutSeconds";
    static discriminator = undefined;
    static attributeTypeMap = [
        {
            "name": "exec",
            "baseName": "exec",
            "type": "IoK8sApiCoreV1ExecAction",
            "format": ""
        },
        {
            "name": "failureThreshold",
            "baseName": "failureThreshold",
            "type": "number",
            "format": "int32"
        },
        {
            "name": "httpGet",
            "baseName": "httpGet",
            "type": "IoK8sApiCoreV1HTTPGetAction",
            "format": ""
        },
        {
            "name": "initialDelaySeconds",
            "baseName": "initialDelaySeconds",
            "type": "number",
            "format": "int32"
        },
        {
            "name": "periodSeconds",
            "baseName": "periodSeconds",
            "type": "number",
            "format": "int32"
        },
        {
            "name": "successThreshold",
            "baseName": "successThreshold",
            "type": "number",
            "format": "int32"
        },
        {
            "name": "tcpSocket",
            "baseName": "tcpSocket",
            "type": "IoK8sApiCoreV1TCPSocketAction",
            "format": ""
        },
        {
            "name": "timeoutSeconds",
            "baseName": "timeoutSeconds",
            "type": "number",
            "format": "int32"
        }, 
    ];
    static getAttributeTypeMap() {
        return IoK8sApiCoreV1Probe.attributeTypeMap;
    }
    constructor(){
    }
}
class IoK8sApiCoreV1EnvVar {
    "name";
    "value";
    "valueFrom";
    static discriminator = undefined;
    static attributeTypeMap = [
        {
            "name": "name",
            "baseName": "name",
            "type": "string",
            "format": ""
        },
        {
            "name": "value",
            "baseName": "value",
            "type": "string",
            "format": ""
        },
        {
            "name": "valueFrom",
            "baseName": "valueFrom",
            "type": "IoK8sApiCoreV1EnvVarSource",
            "format": ""
        }, 
    ];
    static getAttributeTypeMap() {
        return IoK8sApiCoreV1EnvVar.attributeTypeMap;
    }
    constructor(){
    }
}
var K8sKind;
(function(K8sKind1) {
    K8sKind1["CustomResourceDefinition"] = "CustomResourceDefinition";
    K8sKind1["Service"] = "Service";
    K8sKind1["Namespace"] = "Namespace";
    K8sKind1["Secret"] = "Secret";
    K8sKind1["ConfigMap"] = "ConfigMap";
    K8sKind1["DaemonSet"] = "DaemonSet";
    K8sKind1["Deployment"] = "Deployment";
    K8sKind1["StatefulSet"] = "StatefulSet";
    K8sKind1["Job"] = "Job";
    K8sKind1["StorageClass"] = "StorageClass";
    K8sKind1["Ingress"] = "Ingress";
    K8sKind1["PersistentVolume"] = "PersistentVolume";
    K8sKind1["PersistentVolumeClaim"] = "PersistentVolumeClaim";
    K8sKind1["Role"] = "Role";
    K8sKind1["RoleBinding"] = "RoleBinding";
    K8sKind1["ClusterRole"] = "ClusterRole";
    K8sKind1["ClusterRoleBinding"] = "ClusterRoleBinding";
    K8sKind1["ServiceAccount"] = "ServiceAccount";
})(K8sKind || (K8sKind = {
}));
function createK8sConfigMap(configMap) {
    return {
        apiVersion: "v1",
        kind: K8sKind.ConfigMap,
        ...configMap
    };
}
const logger = loggerWithContext("utils");
function trimFdbCliOutput(output1) {
    let newLineCount = 0;
    for(let i = 0; i < output1.length; i++){
        if (output1.charAt(i) === "\n") {
            newLineCount++;
        }
        if (newLineCount === 3) {
            return output1.substr(i + 1);
        }
    }
    throw new Error(`Invalid fdbcli output: ${output1}`);
}
function commandWithTimeout(command, timeoutSeconds) {
    return [
        "timeout",
        "-k",
        "0",
        `${timeoutSeconds}s`,
        ...command
    ];
}
async function fdbcliCaptureExec(command, timeoutSeconds = 30) {
    try {
        const captured = await captureExec({
            run: {
                cmd: commandWithTimeout(toFdbcliCommand(command), timeoutSeconds)
            }
        });
        return trimFdbCliOutput(captured);
    } catch (e) {
        if (e.message.indexOf("Command return non-zero status of: 124") !== -1) {
            throw new Error(`Timed out executing fdbcli with '${command}' after ${timeoutSeconds}s`);
        } else {
            throw e;
        }
    }
}
async function fdbcliInheritExec(command, timeoutSeconds = 30) {
    try {
        await inheritExec({
            run: {
                cmd: commandWithTimeout(toFdbcliCommand(command), timeoutSeconds)
            }
        });
    } catch (e) {
        if (e.message.indexOf("Command return non-zero status of: 124") !== -1) {
            throw new Error(`Timed out executing fdbcli with '${command}' after ${timeoutSeconds}s`);
        } else {
            throw e;
        }
    }
}
async function fetchStatus(timeoutMs = 30000) {
    const json = await fdbcliCaptureExec("status json", timeoutMs);
    const parsed = JSON.parse(json);
    const statusValidation = validate1(FdbStatusSchema, parsed);
    if (!statusValidation.isSuccess) {
        logger.error(json);
        throw new Error(`FDB status JSON payload failed schema validation: ${JSON.stringify(statusValidation.errors, null, 2)}`);
    }
    return statusValidation.value;
}
function toFdbcliCommand(command) {
    return [
        "fdbcli",
        "--exec",
        `option on PRIORITY_SYSTEM_IMMEDIATE; ${command}`, 
    ];
}
function toRootElevatedCommand(command) {
    return [
        "nsenter",
        "-t",
        "1",
        "-m",
        "-u",
        "-n",
        "-i",
        ...command, 
    ];
}
const readCurrentNamespace = memoizePromise(()=>Deno.readTextFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")
);
async function readClusterConfig(configFile) {
    const configJson = JSON.parse(await Deno.readTextFile(configFile));
    const configValidation = validate1(FdbDatabaseConfigSchema, configJson);
    if (!configValidation.isSuccess) {
        logger.error(configValidation.errors);
        throw new Error("Invalid cluster config");
    }
    return configValidation.value;
}
function RelaxedObject1(properties2) {
    return Type.Object(properties2, {
        additionalProperties: true
    });
}
const ServiceSpecSchema = RelaxedObject1({
    clusterIP: Type.String({
        format: "ipv4"
    }),
    ports: Type.Array(RelaxedObject1({
        port: Type.Number()
    }), {
        minItems: 1
    })
});
async function kubectlInherit({ args , stdin , timeoutSeconds =5  }) {
    return await inheritExec({
        run: {
            cmd: commandWithTimeout([
                "kubectl",
                ...args, 
            ], timeoutSeconds)
        },
        stdin
    });
}
async function kubectlCapture({ args , stdin , timeoutSeconds =5  }) {
    return await captureExec({
        run: {
            cmd: commandWithTimeout([
                "kubectl",
                ...args, 
            ], timeoutSeconds)
        },
        stdin
    });
}
async function kubectlGetJson({ args , schema , timeoutSeconds  }) {
    const fullArgs = [
        "get",
        ...args
    ];
    const output1 = await kubectlCapture({
        args: fullArgs,
        timeoutSeconds
    });
    const validation = validate1(schema, JSON.parse(output1));
    if (!validation.isSuccess) {
        logger.error(output1);
        throw new Error(`'kubectl ${fullArgs.join(" ")}' output failed schema validation. Errors: ${JSON.stringify(validation.errors, null, 2)}`);
    }
    return validation.value;
}
async function fetchServiceSpecs(serviceNames) {
    const namespace = await readCurrentNamespace();
    const promises = serviceNames.map((name3)=>{
        return kubectlGetJson({
            args: [
                `service/${name3}`,
                "-n",
                namespace,
                "-o=jsonpath={.spec}", 
            ],
            schema: ServiceSpecSchema
        });
    });
    return await Promise.all(promises);
}
async function fetchCoordinatorEndpointsFromServiceNames(serviceNames) {
    const specs = await fetchServiceSpecs(serviceNames);
    return specs.map((spec)=>`${spec.clusterIP}:${spec.ports[0].port}`
    );
}
async function updateConnectionStringConfigMap({ configMapKey , configMapName , connectionString  }) {
    const namespace = await readCurrentNamespace();
    const configMap = createK8sConfigMap({
        metadata: {
            name: configMapName,
            namespace
        },
        data: {
            [configMapKey]: connectionString
        }
    });
    await kubectlInherit({
        args: [
            "apply",
            "-f",
            "-"
        ],
        stdin: JSON.stringify(configMap)
    });
}
const logger1 = loggerWithContext("main");
async function configureCoordinators(status, config) {
    const { coordinatorServiceNames  } = config;
    const currentCoordinators = status.client.coordinators.coordinators.map(({ address  })=>address
    ).sort().join(" ");
    const coordinators = (await fetchCoordinatorEndpointsFromServiceNames(coordinatorServiceNames)).sort().join(" ");
    if (currentCoordinators !== coordinators) {
        logger1.info(`Coordinators changed from "${currentCoordinators}" to "${coordinators}", going to configure...`);
        await fdbcliInheritExec(`coordinators ${coordinators}`);
    }
    return true;
}
async function configureDatabase(status, config) {
    const currentClusterConfig = status.cluster.configuration;
    const { logCount , proxyCount , resolverCount , redundancyMode , storageEngine ,  } = config;
    if (!currentClusterConfig || currentClusterConfig.logs !== logCount || currentClusterConfig.proxies !== proxyCount || currentClusterConfig.resolvers !== resolverCount || currentClusterConfig.redundancy_mode !== redundancyMode || currentClusterConfig.storage_engine !== storageEngine) {
        const recoveryState = status.cluster.recovery_state?.name || "unknown";
        const createNew = recoveryState === "configuration_never_created";
        if (status.client.database_status.available || createNew) {
            const cmd = `configure${createNew ? " new" : ""} ${redundancyMode} ${storageEngine} resolvers=${resolverCount} proxies=${proxyCount} logs=${logCount}`;
            logger1.info(`Configuration changed, going to execute: ${cmd}`);
            await fdbcliInheritExec(cmd);
        } else {
            const recoveryStateDescription = status.cluster.recovery_state?.description || "Unknown";
            logger1.info("Failed configuring database!");
            logger1.info(`Recovery state name: ${recoveryState}`);
            logger1.info(`Recovery state description: ${recoveryStateDescription}`);
            logger1.info(`Attempting to fetch status details to help debugging...`);
            await fdbcliInheritExec("status details");
            return false;
        }
    } else {
        logger1.info("No configuration change, nothing to do");
    }
    return true;
}
function prettyPrintProcessInfo({ id: id1 , machineId , processClass , address  }) {
    return `   - machine=${machineId || "unknown"} id=${id1} class=${processClass} address=${address}`;
}
async function excludeAndIncludeProcesses(status, config) {
    if (!status.client.coordinators.quorum_reachable) {
        logger1.error("Quorum not reachable, going to skip");
        return false;
    }
    const { excludedServiceEndpoints  } = config;
    const desiredExcludedAddresses = await (async ()=>{
        if (excludedServiceEndpoints.length === 0) {
            return [];
        } else {
            logger1.info(`There are ${excludedServiceEndpoints.length} desired excluded service endpoints`, JSON.stringify(excludedServiceEndpoints, null, 2));
            const serviceSpecs = await fetchServiceSpecs(excludedServiceEndpoints.map((e)=>e.name
            ));
            return serviceSpecs.map((s, i)=>`${s.clusterIP}:${excludedServiceEndpoints[i].port}`
            );
        }
    })();
    const desiredExcludedAddressSet = new Set(desiredExcludedAddresses);
    const processList = Object.values(status.cluster.processes || {
    });
    const currentAddressSet = new Set(processList.map((p)=>p.address
    ));
    const currentlyExcludedAddresses = processList.filter((p)=>p.excluded
    ).map((p)=>p.address
    );
    const currentlyExcludedAddressSet = new Set(currentlyExcludedAddresses);
    const processByAddressMap = Object.fromEntries(Object.entries(status.cluster.processes || {
    }).map(([id1, p])=>[
            p.address,
            {
                id: id1,
                processClass: p.class_type,
                machineId: p.machine_id,
                address: p.address
            }
        ]
    ));
    const nonexistentExcludedAddresses = desiredExcludedAddresses.filter((a)=>!currentAddressSet.has(a)
    );
    const alreadyExcludedAddresses = desiredExcludedAddresses.filter((a)=>currentlyExcludedAddressSet.has(a)
    );
    const toBeExcludedAddresses = desiredExcludedAddresses.filter((a)=>currentAddressSet.has(a) && !currentlyExcludedAddressSet.has(a)
    );
    const toBeIncludedAddresses = currentlyExcludedAddresses.filter((a)=>!desiredExcludedAddressSet.has(a)
    );
    if (nonexistentExcludedAddresses.length > 0) {
        logger1.warn(`There are ${nonexistentExcludedAddresses.length} addresses to be excluded but they don't exist in FDB status:\n${nonexistentExcludedAddresses.map((a)=>prettyPrintProcessInfo(processByAddressMap[a])
        ).join("\n")}`);
    }
    if (alreadyExcludedAddresses.length > 0) {
        logger1.info(`The following ${alreadyExcludedAddresses.length} addresses have already been previously excluded:\n${alreadyExcludedAddresses.map((a)=>prettyPrintProcessInfo(processByAddressMap[a])
        ).join("\n")}`);
    }
    if (toBeIncludedAddresses.length > 0) {
        logger1.info(`The following ${toBeIncludedAddresses.length} addresses will be included back:\n${toBeIncludedAddresses.map((a)=>prettyPrintProcessInfo(processByAddressMap[a])
        ).join("\n")}`);
        await fdbcliInheritExec(`include ${toBeIncludedAddresses.join(" ")}`);
    }
    if (toBeExcludedAddresses.length === 0) {
        logger1.info("No new address to be excluded");
    } else {
        logger1.info(`Going to exclude:\n${toBeExcludedAddresses.map((a)=>prettyPrintProcessInfo(processByAddressMap[a])
        ).join("\n")}`);
        if (!status.client.database_status.available) {
            logger1.error("Database is not available, going to skip excluding");
        } else {
            await fdbcliInheritExec(`exclude no_wait ${toBeExcludedAddresses.join(" ")}`);
        }
    }
    return true;
}
const __default = createCliAction(Type.Object({
    configFile: NonEmptyString()
}), async ({ configFile ,  })=>{
    const config = await readClusterConfig(configFile);
    const status = await fetchStatus();
    const steps = [
        {
            name: "Configure coordinators",
            fn: configureCoordinators
        },
        {
            name: "Exclude and include processes",
            fn: excludeAndIncludeProcesses
        },
        {
            name: "Configure database",
            fn: configureDatabase
        }, 
    ];
    for (const { name: name3 , fn  } of steps){
        logger1.info(`Running step: '${name3}' --------------------------------------------`);
        if (!await fn(status, config)) {
            logger1.error(`Step ${name3} failed, going to stop`);
            return ExitCode.One;
        }
    }
    return ExitCode.Zero;
});
const logger2 = loggerWithContext("main");
function generateString(length) {
    return Array.from(Array(length), ()=>Math.floor(Math.random() * 36).toString(36)
    ).join("");
}
const __default1 = createCliAction(Type.Object({
    configMapKey: NonEmptyString(),
    configMapName: NonEmptyString(),
    serviceNames: Type.Union([
        Type.Array(NonEmptyString()),
        NonEmptyString()
    ])
}), async ({ configMapKey , configMapName , serviceNames ,  })=>{
    const serviceNameArray = typeof serviceNames === "string" ? [
        serviceNames
    ] : serviceNames;
    const namespace = await readCurrentNamespace();
    const hasExistingConfigMap = await (async ()=>{
        const cmd = [
            "kubectl",
            "get",
            `configmap/${configMapName}`,
            "-n",
            namespace, 
        ];
        const child = Deno.run({
            cmd: commandWithTimeout(cmd, 5),
            stdout: "null",
            stderr: "piped"
        });
        const stderr = new TextDecoder().decode(await child.stderrOutput());
        const { code: code4  } = await child.status();
        if (code4 === 0) {
            return true;
        } else if (stderr.indexOf("not found") !== -1) {
            return false;
        }
        logger2.error(cmd.join(" "));
        throw new Error(`Command exited with code '${code4}' and stderr: ${stderr}`);
    })();
    if (hasExistingConfigMap) {
        logger2.info(`ConfigMap '${configMapName}' already exists, nothing to do`);
        return ExitCode.Zero;
    }
    const coordinatorEndpoints = await fetchCoordinatorEndpointsFromServiceNames(serviceNameArray);
    const clusterDescription = generateString(32);
    const clusterId = generateString(8);
    const connectionString = `${clusterDescription}:${clusterId}@${coordinatorEndpoints.join(",")}`;
    logger2.info(`Going to create ConfigMap '${configMapName}' with data key '${configMapKey}' and value '${connectionString}'`);
    await updateConnectionStringConfigMap({
        configMapKey,
        configMapName,
        connectionString
    });
    logger2.info(`ConfigMap '${configMapName}' created successfully!`);
    return ExitCode.Zero;
});
const logger3 = loggerWithContext("main");
const FDB_CLUSTER_FILE = "FDB_CLUSTER_FILE";
const connectionStringResultRegex = /`\\xff\\xff\/connection_string' is `([^']+)'/;
const __default2 = createCliAction(Type.Object({
    configMapKey: NonEmptyString(),
    configMapName: NonEmptyString(),
    updateIntervalMs: Type.Number()
}), async ({ configMapKey , configMapName , updateIntervalMs ,  })=>{
    const clusterFile = Deno.env.get(FDB_CLUSTER_FILE);
    if (!clusterFile) {
        throw new Error(`${FDB_CLUSTER_FILE} env variable is not set`);
    }
    let lastConnectionString = (await Deno.readTextFile(clusterFile)).trim();
    logger3.info("Connection string sync loop started with last value", lastConnectionString);
    while(true){
        try {
            logger3.debug("Getting current connection string");
            const connectionStringResult = await fdbcliCaptureExec(`status minimal; get \\xFF\\xFF/connection_string`);
            const connectionStringMatch = connectionStringResult.match(connectionStringResultRegex);
            if (!connectionStringMatch) {
                throw new Error(`Connection string result doesn't match regex: ${connectionStringResult}`);
            }
            const connectionString = connectionStringMatch[1];
            if (connectionString === lastConnectionString) {
                logger3.debug(`Connection string hasn't changed`, connectionString);
            } else {
                logger3.info(`Connection string changed from '${lastConnectionString}' to ${connectionString}`);
                logger3.info(`Going to update ConfigMap '${configMapName}' with data key '${configMapKey}' and value '${connectionString}'`);
                await updateConnectionStringConfigMap({
                    configMapKey,
                    configMapName,
                    connectionString
                });
                logger3.info(`ConfigMap '${configMapName}' updated successfully!`);
                lastConnectionString = connectionString;
            }
        } catch (e) {
            logger3.error(e.toString());
        }
        await delay(updateIntervalMs);
    }
});
const osType = (()=>{
    if (globalThis.Deno != null) {
        return Deno.build.os;
    }
    const navigator = globalThis.navigator;
    if (navigator?.appVersion?.includes?.("Win") ?? false) {
        return "windows";
    }
    return "linux";
})();
const isWindows = osType === "windows";
const CHAR_FORWARD_SLASH = 47;
function assertPath(path) {
    if (typeof path !== "string") {
        throw new TypeError(`Path must be a string. Received ${JSON.stringify(path)}`);
    }
}
function isPosixPathSeparator(code4) {
    return code4 === 47;
}
function isPathSeparator(code4) {
    return isPosixPathSeparator(code4) || code4 === 92;
}
function isWindowsDeviceRoot(code4) {
    return code4 >= 97 && code4 <= 122 || code4 >= 65 && code4 <= 90;
}
function normalizeString(path, allowAboveRoot, separator, isPathSeparator1) {
    let res = "";
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code4;
    for(let i = 0, len = path.length; i <= len; ++i){
        if (i < len) code4 = path.charCodeAt(i);
        else if (isPathSeparator1(code4)) break;
        else code4 = CHAR_FORWARD_SLASH;
        if (isPathSeparator1(code4)) {
            if (lastSlash === i - 1 || dots === 1) {
            } else if (lastSlash !== i - 1 && dots === 2) {
                if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
                    if (res.length > 2) {
                        const lastSlashIndex = res.lastIndexOf(separator);
                        if (lastSlashIndex === -1) {
                            res = "";
                            lastSegmentLength = 0;
                        } else {
                            res = res.slice(0, lastSlashIndex);
                            lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
                        }
                        lastSlash = i;
                        dots = 0;
                        continue;
                    } else if (res.length === 2 || res.length === 1) {
                        res = "";
                        lastSegmentLength = 0;
                        lastSlash = i;
                        dots = 0;
                        continue;
                    }
                }
                if (allowAboveRoot) {
                    if (res.length > 0) res += `${separator}..`;
                    else res = "..";
                    lastSegmentLength = 2;
                }
            } else {
                if (res.length > 0) res += separator + path.slice(lastSlash + 1, i);
                else res = path.slice(lastSlash + 1, i);
                lastSegmentLength = i - lastSlash - 1;
            }
            lastSlash = i;
            dots = 0;
        } else if (code4 === 46 && dots !== -1) {
            ++dots;
        } else {
            dots = -1;
        }
    }
    return res;
}
function _format(sep, pathObject) {
    const dir = pathObject.dir || pathObject.root;
    const base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
    if (!dir) return base;
    if (dir === pathObject.root) return dir + base;
    return dir + sep + base;
}
const WHITESPACE_ENCODINGS = {
    "\u0009": "%09",
    "\u000A": "%0A",
    "\u000B": "%0B",
    "\u000C": "%0C",
    "\u000D": "%0D",
    "\u0020": "%20"
};
function encodeWhitespace(string) {
    return string.replaceAll(/[\s]/g, (c)=>{
        return WHITESPACE_ENCODINGS[c] ?? c;
    });
}
const sep = "\\";
const delimiter = ";";
function resolve1(...pathSegments) {
    let resolvedDevice = "";
    let resolvedTail = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1; i--){
        let path;
        if (i >= 0) {
            path = pathSegments[i];
        } else if (!resolvedDevice) {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a drive-letter-less path without a CWD.");
            }
            path = Deno.cwd();
        } else {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path = Deno.env.get(`=${resolvedDevice}`) || Deno.cwd();
            if (path === undefined || path.slice(0, 3).toLowerCase() !== `${resolvedDevice.toLowerCase()}\\`) {
                path = `${resolvedDevice}\\`;
            }
        }
        assertPath(path);
        const len = path.length;
        if (len === 0) continue;
        let rootEnd = 0;
        let device = "";
        let isAbsolute = false;
        const code4 = path.charCodeAt(0);
        if (len > 1) {
            if (isPathSeparator(code4)) {
                isAbsolute = true;
                if (isPathSeparator(path.charCodeAt(1))) {
                    let j = 2;
                    let last = j;
                    for(; j < len; ++j){
                        if (isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        const firstPart = path.slice(last, j);
                        last = j;
                        for(; j < len; ++j){
                            if (!isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j < len && j !== last) {
                            last = j;
                            for(; j < len; ++j){
                                if (isPathSeparator(path.charCodeAt(j))) break;
                            }
                            if (j === len) {
                                device = `\\\\${firstPart}\\${path.slice(last)}`;
                                rootEnd = j;
                            } else if (j !== last) {
                                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                                rootEnd = j;
                            }
                        }
                    }
                } else {
                    rootEnd = 1;
                }
            } else if (isWindowsDeviceRoot(code4)) {
                if (path.charCodeAt(1) === 58) {
                    device = path.slice(0, 2);
                    rootEnd = 2;
                    if (len > 2) {
                        if (isPathSeparator(path.charCodeAt(2))) {
                            isAbsolute = true;
                            rootEnd = 3;
                        }
                    }
                }
            }
        } else if (isPathSeparator(code4)) {
            rootEnd = 1;
            isAbsolute = true;
        }
        if (device.length > 0 && resolvedDevice.length > 0 && device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            continue;
        }
        if (resolvedDevice.length === 0 && device.length > 0) {
            resolvedDevice = device;
        }
        if (!resolvedAbsolute) {
            resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
            resolvedAbsolute = isAbsolute;
        }
        if (resolvedAbsolute && resolvedDevice.length > 0) break;
    }
    resolvedTail = normalizeString(resolvedTail, !resolvedAbsolute, "\\", isPathSeparator);
    return resolvedDevice + (resolvedAbsolute ? "\\" : "") + resolvedTail || ".";
}
function normalize(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return ".";
    let rootEnd = 0;
    let device;
    let isAbsolute = false;
    const code4 = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code4)) {
            isAbsolute = true;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    const firstPart = path.slice(last, j);
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return `\\\\${firstPart}\\${path.slice(last)}\\`;
                        } else if (j !== last) {
                            device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                            rootEnd = j;
                        }
                    }
                }
            } else {
                rootEnd = 1;
            }
        } else if (isWindowsDeviceRoot(code4)) {
            if (path.charCodeAt(1) === 58) {
                device = path.slice(0, 2);
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) {
                        isAbsolute = true;
                        rootEnd = 3;
                    }
                }
            }
        }
    } else if (isPathSeparator(code4)) {
        return "\\";
    }
    let tail;
    if (rootEnd < len) {
        tail = normalizeString(path.slice(rootEnd), !isAbsolute, "\\", isPathSeparator);
    } else {
        tail = "";
    }
    if (tail.length === 0 && !isAbsolute) tail = ".";
    if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
        tail += "\\";
    }
    if (device === undefined) {
        if (isAbsolute) {
            if (tail.length > 0) return `\\${tail}`;
            else return "\\";
        } else if (tail.length > 0) {
            return tail;
        } else {
            return "";
        }
    } else if (isAbsolute) {
        if (tail.length > 0) return `${device}\\${tail}`;
        else return `${device}\\`;
    } else if (tail.length > 0) {
        return device + tail;
    } else {
        return device;
    }
}
function isAbsolute(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return false;
    const code4 = path.charCodeAt(0);
    if (isPathSeparator(code4)) {
        return true;
    } else if (isWindowsDeviceRoot(code4)) {
        if (len > 2 && path.charCodeAt(1) === 58) {
            if (isPathSeparator(path.charCodeAt(2))) return true;
        }
    }
    return false;
}
function join(...paths) {
    const pathsCount = paths.length;
    if (pathsCount === 0) return ".";
    let joined;
    let firstPart = null;
    for(let i = 0; i < pathsCount; ++i){
        const path = paths[i];
        assertPath(path);
        if (path.length > 0) {
            if (joined === undefined) joined = firstPart = path;
            else joined += `\\${path}`;
        }
    }
    if (joined === undefined) return ".";
    let needsReplace = true;
    let slashCount = 0;
    assert(firstPart != null);
    if (isPathSeparator(firstPart.charCodeAt(0))) {
        ++slashCount;
        const firstLen = firstPart.length;
        if (firstLen > 1) {
            if (isPathSeparator(firstPart.charCodeAt(1))) {
                ++slashCount;
                if (firstLen > 2) {
                    if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
                    else {
                        needsReplace = false;
                    }
                }
            }
        }
    }
    if (needsReplace) {
        for(; slashCount < joined.length; ++slashCount){
            if (!isPathSeparator(joined.charCodeAt(slashCount))) break;
        }
        if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
    }
    return normalize(joined);
}
function relative(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) return "";
    const fromOrig = resolve1(from);
    const toOrig = resolve1(to);
    if (fromOrig === toOrig) return "";
    from = fromOrig.toLowerCase();
    to = toOrig.toLowerCase();
    if (from === to) return "";
    let fromStart = 0;
    let fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (from.charCodeAt(fromStart) !== 92) break;
    }
    for(; fromEnd - 1 > fromStart; --fromEnd){
        if (from.charCodeAt(fromEnd - 1) !== 92) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 0;
    let toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (to.charCodeAt(toStart) !== 92) break;
    }
    for(; toEnd - 1 > toStart; --toEnd){
        if (to.charCodeAt(toEnd - 1) !== 92) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (to.charCodeAt(toStart + i) === 92) {
                    return toOrig.slice(toStart + i + 1);
                } else if (i === 2) {
                    return toOrig.slice(toStart + i);
                }
            }
            if (fromLen > length) {
                if (from.charCodeAt(fromStart + i) === 92) {
                    lastCommonSep = i;
                } else if (i === 2) {
                    lastCommonSep = 3;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (fromCode === 92) lastCommonSep = i;
    }
    if (i !== length && lastCommonSep === -1) {
        return toOrig;
    }
    let out = "";
    if (lastCommonSep === -1) lastCommonSep = 0;
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || from.charCodeAt(i) === 92) {
            if (out.length === 0) out += "..";
            else out += "\\..";
        }
    }
    if (out.length > 0) {
        return out + toOrig.slice(toStart + lastCommonSep, toEnd);
    } else {
        toStart += lastCommonSep;
        if (toOrig.charCodeAt(toStart) === 92) ++toStart;
        return toOrig.slice(toStart, toEnd);
    }
}
function toNamespacedPath(path) {
    if (typeof path !== "string") return path;
    if (path.length === 0) return "";
    const resolvedPath = resolve1(path);
    if (resolvedPath.length >= 3) {
        if (resolvedPath.charCodeAt(0) === 92) {
            if (resolvedPath.charCodeAt(1) === 92) {
                const code4 = resolvedPath.charCodeAt(2);
                if (code4 !== 63 && code4 !== 46) {
                    return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
                }
            }
        } else if (isWindowsDeviceRoot(resolvedPath.charCodeAt(0))) {
            if (resolvedPath.charCodeAt(1) === 58 && resolvedPath.charCodeAt(2) === 92) {
                return `\\\\?\\${resolvedPath}`;
            }
        }
    }
    return path;
}
function dirname(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return ".";
    let rootEnd = -1;
    let end = -1;
    let matchedSlash = true;
    let offset = 0;
    const code4 = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code4)) {
            rootEnd = offset = 1;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return path;
                        }
                        if (j !== last) {
                            rootEnd = offset = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot(code4)) {
            if (path.charCodeAt(1) === 58) {
                rootEnd = offset = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) rootEnd = offset = 3;
                }
            }
        }
    } else if (isPathSeparator(code4)) {
        return path;
    }
    for(let i = len - 1; i >= offset; --i){
        if (isPathSeparator(path.charCodeAt(i))) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) {
        if (rootEnd === -1) return ".";
        else end = rootEnd;
    }
    return path.slice(0, end);
}
function basename(path, ext = "") {
    if (ext !== undefined && typeof ext !== "string") {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath(path);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (path.length >= 2) {
        const drive = path.charCodeAt(0);
        if (isWindowsDeviceRoot(drive)) {
            if (path.charCodeAt(1) === 58) start = 2;
        }
    }
    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) return "";
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for(i = path.length - 1; i >= start; --i){
            const code4 = path.charCodeAt(i);
            if (isPathSeparator(code4)) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code4 === ext.charCodeAt(extIdx)) {
                        if ((--extIdx) === -1) {
                            end = i;
                        }
                    } else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
    } else {
        for(i = path.length - 1; i >= start; --i){
            if (isPathSeparator(path.charCodeAt(i))) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else if (end === -1) {
                matchedSlash = false;
                end = i + 1;
            }
        }
        if (end === -1) return "";
        return path.slice(start, end);
    }
}
function extname(path) {
    assertPath(path);
    let start = 0;
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    if (path.length >= 2 && path.charCodeAt(1) === 58 && isWindowsDeviceRoot(path.charCodeAt(0))) {
        start = startPart = 2;
    }
    for(let i = path.length - 1; i >= start; --i){
        const code4 = path.charCodeAt(i);
        if (isPathSeparator(code4)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code4 === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path.slice(startDot, end);
}
function format3(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format("\\", pathObject);
}
function parse1(path) {
    assertPath(path);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    const len = path.length;
    if (len === 0) return ret;
    let rootEnd = 0;
    let code4 = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code4)) {
            rootEnd = 1;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            rootEnd = j;
                        } else if (j !== last) {
                            rootEnd = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot(code4)) {
            if (path.charCodeAt(1) === 58) {
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) {
                        if (len === 3) {
                            ret.root = ret.dir = path;
                            return ret;
                        }
                        rootEnd = 3;
                    }
                } else {
                    ret.root = ret.dir = path;
                    return ret;
                }
            }
        }
    } else if (isPathSeparator(code4)) {
        ret.root = ret.dir = path;
        return ret;
    }
    if (rootEnd > 0) ret.root = path.slice(0, rootEnd);
    let startDot = -1;
    let startPart = rootEnd;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for(; i >= rootEnd; --i){
        code4 = path.charCodeAt(i);
        if (isPathSeparator(code4)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code4 === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            ret.base = ret.name = path.slice(startPart, end);
        }
    } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
        ret.ext = path.slice(startDot, end);
    }
    if (startPart > 0 && startPart !== rootEnd) {
        ret.dir = path.slice(0, startPart - 1);
    } else ret.dir = ret.root;
    return ret;
}
function fromFileUrl(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    let path = decodeURIComponent(url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
    if (url.hostname != "") {
        path = `\\\\${url.hostname}${path}`;
    }
    return path;
}
function toFileUrl(path) {
    if (!isAbsolute(path)) {
        throw new TypeError("Must be an absolute path.");
    }
    const [, hostname, pathname] = path.match(/^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/);
    const url = new URL("file:///");
    url.pathname = encodeWhitespace(pathname.replace(/%/g, "%25"));
    if (hostname != null && hostname != "localhost") {
        url.hostname = hostname;
        if (!url.hostname) {
            throw new TypeError("Invalid hostname.");
        }
    }
    return url;
}
const mod = function() {
    return {
        sep: sep,
        delimiter: delimiter,
        resolve: resolve1,
        normalize: normalize,
        isAbsolute: isAbsolute,
        join: join,
        relative: relative,
        toNamespacedPath: toNamespacedPath,
        dirname: dirname,
        basename: basename,
        extname: extname,
        format: format3,
        parse: parse1,
        fromFileUrl: fromFileUrl,
        toFileUrl: toFileUrl
    };
}();
const sep1 = "/";
const delimiter1 = ":";
function resolve2(...pathSegments) {
    let resolvedPath = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1 && !resolvedAbsolute; i--){
        let path;
        if (i >= 0) path = pathSegments[i];
        else {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path = Deno.cwd();
        }
        assertPath(path);
        if (path.length === 0) {
            continue;
        }
        resolvedPath = `${path}/${resolvedPath}`;
        resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }
    resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute, "/", isPosixPathSeparator);
    if (resolvedAbsolute) {
        if (resolvedPath.length > 0) return `/${resolvedPath}`;
        else return "/";
    } else if (resolvedPath.length > 0) return resolvedPath;
    else return ".";
}
function normalize1(path) {
    assertPath(path);
    if (path.length === 0) return ".";
    const isAbsolute1 = path.charCodeAt(0) === 47;
    const trailingSeparator = path.charCodeAt(path.length - 1) === 47;
    path = normalizeString(path, !isAbsolute1, "/", isPosixPathSeparator);
    if (path.length === 0 && !isAbsolute1) path = ".";
    if (path.length > 0 && trailingSeparator) path += "/";
    if (isAbsolute1) return `/${path}`;
    return path;
}
function isAbsolute1(path) {
    assertPath(path);
    return path.length > 0 && path.charCodeAt(0) === 47;
}
function join1(...paths) {
    if (paths.length === 0) return ".";
    let joined;
    for(let i = 0, len = paths.length; i < len; ++i){
        const path = paths[i];
        assertPath(path);
        if (path.length > 0) {
            if (!joined) joined = path;
            else joined += `/${path}`;
        }
    }
    if (!joined) return ".";
    return normalize1(joined);
}
function relative1(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) return "";
    from = resolve2(from);
    to = resolve2(to);
    if (from === to) return "";
    let fromStart = 1;
    const fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (from.charCodeAt(fromStart) !== 47) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 1;
    const toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (to.charCodeAt(toStart) !== 47) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (to.charCodeAt(toStart + i) === 47) {
                    return to.slice(toStart + i + 1);
                } else if (i === 0) {
                    return to.slice(toStart + i);
                }
            } else if (fromLen > length) {
                if (from.charCodeAt(fromStart + i) === 47) {
                    lastCommonSep = i;
                } else if (i === 0) {
                    lastCommonSep = 0;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (fromCode === 47) lastCommonSep = i;
    }
    let out = "";
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || from.charCodeAt(i) === 47) {
            if (out.length === 0) out += "..";
            else out += "/..";
        }
    }
    if (out.length > 0) return out + to.slice(toStart + lastCommonSep);
    else {
        toStart += lastCommonSep;
        if (to.charCodeAt(toStart) === 47) ++toStart;
        return to.slice(toStart);
    }
}
function toNamespacedPath1(path) {
    return path;
}
function dirname1(path) {
    assertPath(path);
    if (path.length === 0) return ".";
    const hasRoot = path.charCodeAt(0) === 47;
    let end = -1;
    let matchedSlash = true;
    for(let i = path.length - 1; i >= 1; --i){
        if (path.charCodeAt(i) === 47) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) return hasRoot ? "/" : ".";
    if (hasRoot && end === 1) return "//";
    return path.slice(0, end);
}
function basename1(path, ext = "") {
    if (ext !== undefined && typeof ext !== "string") {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath(path);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) return "";
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for(i = path.length - 1; i >= 0; --i){
            const code4 = path.charCodeAt(i);
            if (code4 === 47) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code4 === ext.charCodeAt(extIdx)) {
                        if ((--extIdx) === -1) {
                            end = i;
                        }
                    } else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
    } else {
        for(i = path.length - 1; i >= 0; --i){
            if (path.charCodeAt(i) === 47) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else if (end === -1) {
                matchedSlash = false;
                end = i + 1;
            }
        }
        if (end === -1) return "";
        return path.slice(start, end);
    }
}
function extname1(path) {
    assertPath(path);
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for(let i = path.length - 1; i >= 0; --i){
        const code4 = path.charCodeAt(i);
        if (code4 === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code4 === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path.slice(startDot, end);
}
function format4(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format("/", pathObject);
}
function parse2(path) {
    assertPath(path);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    if (path.length === 0) return ret;
    const isAbsolute2 = path.charCodeAt(0) === 47;
    let start;
    if (isAbsolute2) {
        ret.root = "/";
        start = 1;
    } else {
        start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for(; i >= start; --i){
        const code4 = path.charCodeAt(i);
        if (code4 === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code4 === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            if (startPart === 0 && isAbsolute2) {
                ret.base = ret.name = path.slice(1, end);
            } else {
                ret.base = ret.name = path.slice(startPart, end);
            }
        }
    } else {
        if (startPart === 0 && isAbsolute2) {
            ret.name = path.slice(1, startDot);
            ret.base = path.slice(1, end);
        } else {
            ret.name = path.slice(startPart, startDot);
            ret.base = path.slice(startPart, end);
        }
        ret.ext = path.slice(startDot, end);
    }
    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
    else if (isAbsolute2) ret.dir = "/";
    return ret;
}
function fromFileUrl1(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    return decodeURIComponent(url.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}
function toFileUrl1(path) {
    if (!isAbsolute1(path)) {
        throw new TypeError("Must be an absolute path.");
    }
    const url = new URL("file:///");
    url.pathname = encodeWhitespace(path.replace(/%/g, "%25").replace(/\\/g, "%5C"));
    return url;
}
const mod1 = function() {
    return {
        sep: sep1,
        delimiter: delimiter1,
        resolve: resolve2,
        normalize: normalize1,
        isAbsolute: isAbsolute1,
        join: join1,
        relative: relative1,
        toNamespacedPath: toNamespacedPath1,
        dirname: dirname1,
        basename: basename1,
        extname: extname1,
        format: format4,
        parse: parse2,
        fromFileUrl: fromFileUrl1,
        toFileUrl: toFileUrl1
    };
}();
const path = isWindows ? mod : mod1;
const { basename: basename2 , delimiter: delimiter2 , dirname: dirname2 , extname: extname2 , format: format5 , fromFileUrl: fromFileUrl2 , isAbsolute: isAbsolute2 , join: join2 , normalize: normalize2 , parse: parse3 , relative: relative2 , resolve: resolve3 , sep: sep2 , toFileUrl: toFileUrl2 , toNamespacedPath: toNamespacedPath2 ,  } = path;
const logger4 = loggerWithContext("main");
const __default3 = createCliAction(Type.Object({
    nodeNameEnvVarName: NonEmptyString(),
    pendingLabelName: NonEmptyString(),
    pendingLabelCompletedValue: NonEmptyString(),
    pendingDeviceIdsAnnotationName: NonEmptyString(),
    rootMountPath: NonEmptyString()
}), async ({ nodeNameEnvVarName , pendingLabelName , pendingLabelCompletedValue , pendingDeviceIdsAnnotationName , rootMountPath ,  })=>{
    const nodeName = Deno.env.get(nodeNameEnvVarName);
    if (!nodeName) {
        throw new Error(`${nodeNameEnvVarName} env variable is not set`);
    }
    const nodeAnnotations = await kubectlGetJson({
        args: [
            `node/${nodeName}`,
            "-o=jsonpath={.metadata.annotations}", 
        ],
        schema: Type.Dict(Type.String())
    });
    const deviceIdsString = typeof nodeAnnotations[pendingDeviceIdsAnnotationName] === "string" ? nodeAnnotations[pendingDeviceIdsAnnotationName] : "";
    const deviceIds = deviceIdsString.split(",");
    if (deviceIds.length === 0) {
        logger4.info(`Node annotation '${pendingDeviceIdsAnnotationName}' is empty, nothing to do`);
    } else {
        logger4.info(`Going to prepare the following ${deviceIds.length} devices: ${deviceIds.join(", ")}`);
        for (const deviceId of deviceIds){
            const devicePath = join2("/dev/disk/by-id", deviceId);
            const deviceMountTargetPath = join2(rootMountPath, "dev", deviceId);
            const storageMountSourcePath = join2(deviceMountTargetPath, "storage");
            const logMountSourcePath = join2(deviceMountTargetPath, "log");
            const storageBindMountTargetPath = join2(rootMountPath, "storage", deviceId);
            const logBindMountTargetPath = join2(rootMountPath, "log", deviceId);
            const mountpointCheck = Deno.run({
                cmd: toRootElevatedCommand([
                    "mountpoint",
                    deviceMountTargetPath
                ]),
                stdout: "null",
                stderr: "null"
            });
            const isMounted = (await mountpointCheck.status()).code === 0;
            if (!isMounted) {
                logger4.info(`${deviceMountTargetPath} is not mounted`);
                logger4.info(`Checking for existing file system inside ${devicePath}`);
                const wipefsTest = await captureExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "wipefs",
                            "-a",
                            "-n",
                            devicePath
                        ])
                    }
                });
                if (wipefsTest.trim().length > 0) {
                    logger4.error(`Device possibly contains an existing file system, wipefs test output: ${wipefsTest}`);
                    return ExitCode.One;
                }
                logger4.info(`Making sure /etc/fstab does not already contain a reference to ${devicePath}`);
                const currentFstabContent = await captureExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "cat",
                            "/etc/fstab"
                        ])
                    }
                });
                if (currentFstabContent.indexOf(devicePath) !== -1) {
                    logger4.error(`Device ${devicePath} found inside /etc/fstab`);
                    return ExitCode.One;
                }
                logger4.info(`Formatting ${devicePath}`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "mkfs.ext4",
                            devicePath
                        ])
                    }
                });
                logger4.info(`Writing to /etc/fstab`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "tee",
                            "/etc/fstab"
                        ])
                    },
                    stdin: currentFstabContent + "\n" + `${devicePath}  ${deviceMountTargetPath}  ext4  defaults,noatime,discard,nofail  0 0\n${storageMountSourcePath}  ${storageBindMountTargetPath}  none  bind  0 0\n${logMountSourcePath}  ${logBindMountTargetPath}  none  bind  0 0\n`
                });
                logger4.info(`Creating mount paths`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "mkdir",
                            "-p",
                            deviceMountTargetPath,
                            storageBindMountTargetPath,
                            logBindMountTargetPath, 
                        ])
                    }
                });
                logger4.info(`Making mount target paths immutable`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "chattr",
                            "+i",
                            deviceMountTargetPath,
                            storageBindMountTargetPath,
                            logBindMountTargetPath, 
                        ])
                    }
                });
                logger4.info(`Mounting ${devicePath} to ${deviceMountTargetPath}`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "mount",
                            `--source=${devicePath}`
                        ])
                    }
                });
                logger4.info(`Creating bind-mount source paths: ${storageMountSourcePath} and ${logMountSourcePath}`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "mkdir",
                            "-p",
                            storageMountSourcePath,
                            logMountSourcePath, 
                        ])
                    }
                });
                logger4.info(`Bind-mounting ${storageMountSourcePath} to ${storageBindMountTargetPath}`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "mount",
                            `--source=${storageMountSourcePath}`, 
                        ])
                    }
                });
                logger4.info(`Bind-mounting ${logMountSourcePath} to ${logBindMountTargetPath}`);
                await inheritExec({
                    run: {
                        cmd: toRootElevatedCommand([
                            "mount",
                            `--source=${logMountSourcePath}`, 
                        ])
                    }
                });
            } else {
                logger4.info(`${deviceMountTargetPath} is already a mountpoint, nothing to do`);
            }
        }
    }
    logger4.info(`Removing '${pendingDeviceIdsAnnotationName}' annotation from node ${nodeName}`);
    await kubectlInherit({
        args: [
            "annotate",
            `node/${nodeName}`,
            `${pendingDeviceIdsAnnotationName}-`, 
        ]
    });
    logger4.info(`Setting label '${pendingLabelName}=${pendingLabelCompletedValue}' for node ${nodeName}`);
    await kubectlInherit({
        args: [
            "label",
            "--overwrite",
            `node/${nodeName}`,
            `${pendingLabelName}=${pendingLabelCompletedValue}`, 
        ]
    });
    return ExitCode.Zero;
});
await new CliProgram().addAction("prepare-local-pv", __default3).addAction("configure", __default).addAction("create-connection-string", __default1).addAction("sync-connection-string", __default2).run(Deno.args);


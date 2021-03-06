const { BAD_REQUEST } = require('../errors');

/** Check if a value is a primitive, like a string, a boolean, or a number. */
function isPrimitive(value) {
  return value!==undefined && value!==Object(value);
}

/** Returns the type of an object */
function toType(obj) {
  return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
}

/** Returns the intersection between array1 and array2 */
function intersection(array1, array2) {
  return array1.filter(elt => array2.includes(elt));
}

/** Resolve if any of the promises resolves. */
function any(funcs) {
  const reverse = promise => new Promise((resolve, reject) => promise.then(reject, resolve));
  return reverse(sequence(funcs.map(func => () => reverse(func()))));
}

/** Filter an object to only the provided keys */
function filterObject(object, keys) {
  return Object.keys(object).reduce((res, key) => {
    if(keys.includes(key)) res[key] = object[key];
    return res;
  }, {});
}

/** Stringify functions, arrays, object or other data */
function stringify(data) {
  if(data instanceof Function) return data + '';
  else if(Array.isArray(data)) return '['+data.map(stringify).join(', ')+']';
  else if(data instanceof Object) return JSON.stringify(Object.keys(data).reduce((acc,key) => {acc[key]=stringify(data[key]);return acc;},{}), undefined, 4);
  else return data+'';
}

/** Resolve each promise sequentially. */
function sequence(funcs) {
  const L = [];
  const notFunction = funcs.find(f => !(f instanceof Function));
  if(notFunction) return Promise.reject(`sequence must receive an array of functions that return a promise, but received ${toType(notFunction)} instead.`);
  return funcs.reduce((chaine, func) => chaine.then(func).then(result => L.push(result)), Promise.resolve()).then(() => L);
}

/** Classify the object props into 5 arrays:
 * - empty : keys whose value is present but undefined or null
 * - reserved : reserved keys having special meaning
 * - primitives : keys whose value is a primitive
 * - arrays : keys whose value is an array
 * - objects : keys whose value is an object which is not an array
 */
function classifyData(object) {
  const keys = Object.keys(object);
  const {reserved, constraints, empty} = keys.reduce((acc, key) => {
    //This is the only reserved key denoting a valid constraint
    if(key==='reservedId') {
      acc.constraints.push(key);
    } else if(reservedKeys.includes(key)) {
      acc.reserved.push(key);
    } else if(object[key]!==undefined || object[key]!==null) {
      acc.constraints.push(key);
    } else {
      acc.empty.push(key);
    }
    return acc;
  }, {reserved: [], constraints: [], empty: []});
  const {primitives, objects, arrays} = constraints.reduce(
    (acc,key) => {
      const value = object[key];
      const belongs = isPrimitive(value) ? 'primitives' : Array.isArray(value) ? 'arrays'
        : value.type ? 'primitives' : 'objects';
      acc[belongs].push(key);
      return acc;
    },
    {primitives: [], objects: [], arrays: []}
  );
  return {
    empty, reserved, primitives, objects, arrays
  };
}

/** Classify request fields of a request inside a table into 4 categories
 * - request : the request where `get : '*'` would have been replaced by the table's columns
 * - search : keys whose value is present but undefined
 * - primitives : keys which are a column of the table
 * - objects : keys that reference an object in another table (key+'Id' is a column inside the table) 
 * - arrays : keys that reference a list of objects in another table (through an association table named key+tableName)
 * We also update the request if it was "*"
 */
function classifyRequestData(request, table) {
  const tableData = classifyData(table);

  //We allow using '*' to mean all columns
  if(request.get==='*') request.get = [...tableData.primitives];
  //get must be an array by now
  if(request.get && !Array.isArray(request.get)) throw {
    name : BAD_REQUEST,
    message : `get property must be an array of string in table ${table.tableName} in request ${JSON.stringify(request)}.`,
  };
  //If the object or array key appears in the get instruction, we consider that we want to retrieve all the available data.
  if(request.get) intersection([...tableData.objects, ...tableData.arrays], request.get).forEach(key => {
    if(request[key]) throw {
      name : BAD_REQUEST,
      message : `In table ${table.tableName}, the request cannot contain value ${key} both in the 'get' instruction and in the request itself.`,
    };
    request[key] = { get : '*'};
  });

  //We restrict the request to only the field declared in the table
  //fields that we are trying to get info about
  const search = intersection(request.get || [], tableData.primitives);
  
  //constraints for the research
  const [primitives, objects, arrays] = ['primitives', 'objects', 'arrays'].map(key => intersection(tableData[key], Object.keys(request)));
  return { request, search, primitives, objects, arrays };
}

/** Retrieve a dependency, or throw an error if the dependency is not installed */
function getOptionalDep(dependency, requester) {
  try {
    const dep = require(dependency);
    return dep;
  } catch(err) {
    throw new Error(`You should add ${dependency} to your dependencies to use ${requester}. Run
    npm i -S ${dependency}`);
  }
}

/** Ask the user if they really want to delete their database */
function ensureCreation(databaseName) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve, reject) =>
    rl.question(`Are you sure that you wish to completely erase any previous database called ${databaseName} (y/N)\n`, answer => {
      rl.close();
      answer.toLowerCase()==='y' ? resolve() : reject('If you don\'t want to erase the database, remove the "create" property from the "database" object.');
    })
  );
}

const reservedKeys = ['reservedId', 'set', 'get', 'created', 'deleted', 'edited', 'delete', 'create', 'add', 'remove', 'not', 'like', 'or', 'limit', 'order', 'offset', 'tableName', 'foreignKeys', 'type', 'parent', 'index', 'notNull', 'reserved', 'required'];
const operators = ['not', 'like', 'gt', 'ge', 'lt', 'le', '<', '>', '<=', '>=', '~', '!'];

module.exports = {
  isPrimitive,
  toType,
  intersection,
  stringify,
  filterObject,
  classifyData,
  classifyRequestData,
  reservedKeys,
  operators,
  any,
  sequence,
  getOptionalDep,
  ensureCreation
};
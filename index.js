var
  _ = require('underscore'),
  path = require('path'),
  request = require('request'),
  stream = require('stream')

function ZohoReports (opts) {
  if (this.constructor !== ZohoReports)
    return new ZohoReports(opts)
  if (!opts.user || !opts.authtoken || !opts.db)
    throw (new Error('Please specify zoho username, authtoken and db'))
  _.defaults(this, opts, {
    url: 'https://reportsapi.zoho.com'
  })
}

ZohoReports.prototype.insert = insert
ZohoReports.prototype.update = update
ZohoReports.prototype.delete = deleteFn
ZohoReports.prototype.import = importFn
ZohoReports.prototype.buildUrl = buildUrl
ZohoReports.prototype.buildCriteria = buildCriteria
ZohoReports.prototype.handleError = handleError

function insert (table, data, done) {
  if (!table)
    return done(new Error('You need to pass `table` name parameter.'))
  if (!data)
    return done(new Error('You need to have atleast one column for INSERT or UPDATE action'))
  if (!done)
    done = _.noop
  var
    self = this,
    url = self.buildUrl({
      table: table,
      action: 'insert'
    }),
    opts = {
      url: url,
      form: data,
      method: 'post'
    }
  request(opts, self.handleError(done))
}

function update (table, where, data, done) {
  if (!table)
    return done(new Error('You need to pass `table` name parameter.'))
  if (arguments.length === 3) {
    done = data
    data = where
    where = {}
  }
  if (!data)
    return done(new Error('You need to have atleast one column for INSERT or UPDATE action'))
  if (!done)
    done = _.noop
  data = _.extend(buildCriteria(where), data)
  var
    self = this,
    url = self.buildUrl({
      table: table,
      action: 'update'
    }),
    opts = {
      url: url,
      form: data,
      method: 'post'
    }
  request(opts, self.handleError(done))
}

function deleteFn (table, where, done) {
  if (!table)
    return done(new Error('You need to pass `table` name parameter.'))
  if (typeof arguments[1] == 'function') {
    done = where
    where = {}
  }
  var
    self = this,
    url = self.buildUrl({
      table: table,
      action: 'delete'
    }),
    opts = {
      url: url,
      form: buildCriteria(where),
      method: 'post'
    }
  request(opts, self.handleError(done))
}

function importFn (table, data, done) {
  if (!table)
    return done(new Error('You need to pass `table` name parameter.'))
  if (!data)
    return done(new Error('You need to have atleast one column for INSERT or UPDATE action'))
  if (!done)
    done = _.noop
    var
      self = this,
      url = self.buildUrl({
        table: table,
        action: 'import'
      }),
      opts = {
        url: url,
        formData: buildDataImport(data),
        method: 'post'
      }
      request(opts, self.handleError(done))
}

function buildUrl (opts) {
  // https://reportsapi.zoho.com/api/abc@zoho.com/EmployeeDB/EmployeeDetails?
  //  ZOHO_ACTION=ADDROW&
  //  ZOHO_OUTPUT_FORMAT=XML&
  //  ZOHO_ERROR_FORMAT=XML&
  //  authtoken=g38sl4j4856guvncrywox8251sssds&
  //  ZOHO_API_VERSION=1.0
  var
    self = this,
    action = getZohoAction(opts.action)
  return self.url + '/api/' +
    [ self.user, self.db, opts.table].join('/') +
    '?' +
    'ZOHO_ACTION=' + action +
    '&ZOHO_OUTPUT_FORMAT=JSON&ZOHO_ERROR_FORMAT=JSON&ZOHO_API_VERSION=1.0&' +
    'authtoken=' + self.authtoken
}

function buildCriteria (where) {
  // @TODO: handle $and, $or, relational operator (> , < . LIKE, etc)
  //  https://zohoreportsapi.wiki.zoho.com/Applying-Filters.html
  if (!Object.keys(where).length)
    return {}
  var criteria = []
  _.each(where, function (value, column) {
    criteria.push('("' + column + '"=\'' +  value + '\')')
  })
  criteria = criteria.length === 1 ? criteria[0] : '(' + criteria.join(' and ')+ ')'
  return {
    ZOHO_CRITERIA: criteria
  }
}

function buildDataImport (data) {
  var type, filename, output, file
  if (isReadableStream(data)) {
    file = data
    type = path.extname(data.path) === '.csv' ? 'CSV' : 'JSON'
  } else {
    if (_.isArray(data)) {
      data = JSON.stringify(data)
      type = 'JSON'
      filename = 'data.json'
    } else if (_.isString(data)) {
      type = 'CSV'
      filename = 'data.csv'
    }
    file = {
      value: new Buffer(data),
      options: {
        filename: filename
      }
    }
  }
  output = {
    ZOHO_FILE: file,
    ZOHO_IMPORT_FILETYPE: type,
    ZOHO_IMPORT_TYPE: 'APPEND',
    ZOHO_AUTO_IDENTIFY: 'true',
    ZOHO_CREATE_TABLE: 'false',
    ZOHO_ON_IMPORT_ERROR: 'ABORT',
  }
  return output
}

function handleError (done) {
  return function (err, res, body) {
    var output
    if (err) return done(err)
    try {
      output = JSON.parse(body)
    } catch (e) {
      ouput = body
    }
    if (res.statusCode !== 200) {
      var err = new Error('API error, ' + res.statusCode)
      err.code = res.statusCode
      err.response = output.response
      return done(err)
    }
    return done(null, output)
  }
}

module.exports = ZohoReports

function getZohoAction (action) {
  var actions = {
    insert: 'ADDROW',
    update: 'UPDATE',
    delete: 'DELETE',
    import: 'IMPORT'
  }
  return actions[action]
}

function isReadableStream (obj) {
  return obj instanceof stream.Stream &&
    typeof (obj._read === 'function') &&
    typeof (obj._readableState === 'object')
}

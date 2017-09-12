'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

// index must return a promise that adheres to the contract:
// argument: {offset: 1, limit: 1, sort: {field: 'name', isAscending: true}}
// returns: {data: [{}], total: 1, query: {/* just returns input argument */}}
//


exports.default = function ({ resource, index, limit = 10 }) {
  const dbg = (0, _debug2.default)(`lib:shared:page:${resource}`);

  const INDEX = `${resource}-page/index`;
  const MORE = `${resource}-page/more`;

  function get({ query, dispatch, scroll }) {
    dbg('get: query=%o, scroll=%o', query, scroll);
    dispatch({ type: scroll ? MORE : INDEX, promise: index(query) });
  }

  return {
    actions: {
      onFilter: filter => {
        dbg('action: on-filter: filter=%o', filter);
        return (dispatch, getState) => {
          filter = _lodash2.default.omit(filter, s => {
            return _lodash2.default.isEmpty(_lodash2.default.trim(s));
          });
          const { sort, limit } = _lodash2.default.get(getState(), `${resource}.query`);
          const query = _extends({}, filter, {
            sort: _lodash2.default.get(filter, 'sort') || sort,
            offset: 0,
            limit
          });
          get({ query, dispatch });
        };
      },

      onSort: ({ field, isAscending }) => {
        dbg('action: on-sort: field=%o, is-ascending=%o', field, isAscending);
        return (dispatch, getState) => {
          const { query } = _lodash2.default.get(getState(), resource);
          get({
            query: _extends({}, query, {
              offset: 0,
              sort: { field, isAscending }
            }),
            dispatch
          });
        };
      },

      onPage: index => {
        dbg('action: on-page: page=%o', index);
        return (dispatch, getState) => {
          const { query } = _lodash2.default.get(getState(), resource);
          get({
            query: _extends({}, query, {
              offset: (index - 1) * query.limit
            }),
            dispatch
          });
        };
      },

      onMore: () => {
        dbg('action: on-more');
        return (dispatch, getState) => {
          const { query } = _lodash2.default.get(getState(), resource);
          get({
            query: _extends({}, query, {
              offset: query.offset + query.limit
            }),
            dispatch,
            scroll: true
          });
        };
      }
    },

    reducer: (0, _reduxActions.handleActions)({
      [INDEX]: (state, action) => {
        dbg('reducer: index: state=%o, action=%o', state, action);
        return (0, _reduxPack.handle)(state, action, {
          start: () => _extends({}, state, {
            active: true
          }),
          success: () => {
            const { data, total, query } = action.payload;
            return _extends({}, state, action.payload, {
              active: false,
              more: isMore({ data, total }),
              totalPages: Math.ceil(total / query.limit),
              currentPage: Math.floor(query.offset / query.limit) + 1
            });
          }
        });
      },

      [MORE]: (state, action) => {
        dbg('reducer: more: state=%o, action=%o', state, action);

        return (0, _reduxPack.handle)(state, action, {
          start: () => _extends({}, state, {
            active: true
          }),
          success: () => {
            let data = _lodash2.default.get(state, 'data');
            const { data: newData, total } = action.payload;
            data = data.concat(newData);
            return _extends({}, state, action.payload, {
              active: false,
              more: isMore({ data, total })
            });
          }
        });
      }
    }, {
      query: {
        limit,
        offset: 0,
        sort: { field: null, isAscending: true }
      },
      data: null,
      total: 0,
      active: 0,
      more: true,
      currentPage: 0,
      totalPages: 0
    })
  };
};

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _reduxActions = require('redux-actions');

var _reduxPack = require('redux-pack');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isMore({ data, total }) {
  return data.length > 0 && total > data.length;
}
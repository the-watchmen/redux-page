import debug from 'debug'
import _ from 'lodash'
import {createAction, handleActions} from 'redux-actions'
import {handle} from 'redux-pack'

// actions.index must return a promise that adheres to the contract:
// argument: {offset: 1, limit: 1, sort: {field: 'name', isAscending: true}}
// returns: {data: [{}], total: 1, query: {/* just returns input argument */}}
//
// onSuccess/onFailure are functions which will receive {dispatch, result}
export default function({resource, actions, limit = 10, onSuccess, onFailure}) {
  const dbg = debug(`lib:redux-page[${resource}]`)

  const INDEX = `page[${resource}]/index`
  const MORE = `page[${resource}]/more`
  const CLEAR = `page[${resource}]/clear`

  const GET = `page[${resource}]/get`
  const CREATE = `page[${resource}]/create`
  const UPDATE = `page[${resource}]/update`
  const PATCH = `page[${resource}]/patch`
  const DELETE = `page[${resource}]/delete`

  const clear = createAction(CLEAR)

  const init = {
    query: {
      limit,
      offset: 0,
      sort: {field: null, isAscending: true}
    },
    data: null,
    total: 0,
    active: false,
    more: true,
    currentPage: 0,
    totalPages: 0,
    item: null
  }

  async function get({query, dispatch, scroll}) {
    dbg('get: query=%o, scroll=%o', query, scroll)
    const result = await dispatch({type: scroll ? MORE : INDEX, promise: actions.index({query})})
    dbg('get: result=%o', result)
    if (result.error) {
      onFailure({dispatch, result})
    }
  }

  function onWrite({type, promise}) {
    return dispatch => {
      dispatch({
        type,
        promise,
        meta: {
          onSuccess: result => {
            dbg('on-write: success: result=%o', result)
            onSuccess({dispatch, result})
          },
          onFailure: result => {
            dbg('on-write: failure: result=%o', result)
            onFailure({dispatch, result})
          }
        }
      })
    }
  }

  function getWriteReducer({type}) {
    return (state, action) => {
      dbg('reducer: type=%o, state=%o, action=%o', type, state, action)

      return handle(state, action, {
        start: () => ({
          ...state,
          active: true
        }),
        finish: () => ({
          ...state,
          active: false
        })
      })
    }
  }

  return {
    actions: {
      onFilter: filter => {
        dbg('action: on-filter: filter=%o', filter)
        return (dispatch, getState) => {
          filter = _.omit(filter, s => {
            return _.isEmpty(_.trim(s))
          })
          const {sort, limit} = _.get(getState(), `${resource}.query`)
          const query = {
            ...filter,
            sort: _.get(filter, 'sort') || sort,
            offset: 0,
            limit
          }
          get({query, dispatch})
        }
      },

      onSort: ({field, isAscending}) => {
        dbg('action: on-sort: field=%o, is-ascending=%o', field, isAscending)
        return (dispatch, getState) => {
          const {query} = _.get(getState(), resource)
          get({
            query: {
              ...query,
              offset: 0,
              sort: {field, isAscending}
            },
            dispatch
          })
        }
      },

      onPage: index => {
        dbg('action: on-page: page=%o', index)
        return (dispatch, getState) => {
          const {query} = _.get(getState(), resource)
          get({
            query: {
              ...query,
              offset: (index - 1) * query.limit
            },
            dispatch
          })
        }
      },

      onMore: () => {
        dbg('action: on-more')
        return (dispatch, getState) => {
          const {query} = _.get(getState(), resource)
          get({
            query: {
              ...query,
              offset: query.offset + query.limit
            },
            dispatch,
            scroll: true
          })
        }
      },

      onClear: () => {
        dbg('action: on-clear')
        return dispatch => {
          dispatch(clear())
        }
      },

      onCreate: ({data}) => {
        dbg('action: on-create: data=%o', data)
        return onWrite({type: CREATE, promise: actions.create({data})})
      },

      onUpdate: ({id, data}) => {
        dbg('action: on-update: id=%o, data=%o', id, data)
        return onWrite({type: UPDATE, promise: actions.update({id, data})})
      },

      onPatch: ({id, data}) => {
        dbg('action: on-patch: id=%o, data=%o', id, data)
        return onWrite({type: PATCH, promise: actions.patch({id, data})})
      },

      onDelete: ({id}) => {
        dbg('action: on-delete: id=%o', id)
        return onWrite({type: DELETE, promise: actions.delete({id})})
      },

      onGet: ({id}) => {
        dbg('action: on-get: id=%o', id)
        return dispatch => {
          dbg('action: on-get: thunk: id=%o', id)
          dispatch({
            type: GET,
            promise: actions.get({id}),
            meta: {
              onSuccess: result => {
                dbg('on-get: success: result=%o', result)
                onSuccess({dispatch, result})
              },
              onFailure: result => {
                dbg('on-get: failure: result=%o', result)
                onFailure({dispatch, result})
              }
            }
          })
        }
      }
    },

    reducer: handleActions(
      {
        [INDEX]: (state, action) => {
          dbg('reducer: index: state=%o, action=%o', state, action)
          return handle(state, action, {
            start: () => ({
              ...state,
              active: true
            }),
            success: () => {
              const {data, total, query} = action.payload
              return {
                ...state,
                ...action.payload,
                active: false,
                more: isMore({data, total}),
                totalPages: Math.ceil(total / query.limit),
                currentPage: Math.floor(query.offset / query.limit) + 1
              }
            }
          })
        },

        [MORE]: (state, action) => {
          dbg('reducer: more: state=%o, action=%o', state, action)

          return handle(state, action, {
            start: () => ({
              ...state,
              active: true
            }),
            success: () => {
              let data = _.get(state, 'data')
              const {data: newData, total} = action.payload
              data = data.concat(newData)
              return {
                ...state,
                ...action.payload,
                active: false,
                more: isMore({data, total})
              }
            }
          })
        },

        [CLEAR]: (state, action) => {
          dbg('reducer: clear: state=%o, action=%o', state, action)
          return {
            ...init
          }
        },

        [CREATE]: getWriteReducer({type: CREATE}),
        [UPDATE]: getWriteReducer({type: UPDATE}),
        [PATCH]: getWriteReducer({type: PATCH}),
        [DELETE]: getWriteReducer({type: DELETE}),

        [GET]: (state, action) => {
          dbg('reducer: get: state=%o, action=%o', state, action)

          return handle(state, action, {
            start: () => ({
              ...state,
              active: true
            }),
            success: () => ({
              ...state,
              item: action.payload,
              active: false
            }),
            failure: () => ({
              ...state,
              error: action.payload,
              active: false
            })
          })
        }
      },

      init
    )
  }
}

function isMore({data, total}) {
  return data.length > 0 && total > data.length
}

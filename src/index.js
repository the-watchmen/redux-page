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
  const CLEAR_ITEM = `page[${resource}]/clear-item`

  const GET = `page[${resource}]/get`
  const CREATE = `page[${resource}]/create`
  const UPDATE = `page[${resource}]/update`
  const PATCH = `page[${resource}]/patch`
  const DELETE = `page[${resource}]/delete`

  const clear = createAction(CLEAR)
  const clearItem = createAction(CLEAR_ITEM)

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

  function handleWrite({type, promise}) {
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
      handleFilter: filter => {
        dbg('action: handle-filter: filter=%o', filter)
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

      handleRefresh: () => {
        dbg('action: handle-refresh')
        return (dispatch, getState) => {
          const query = _.get(getState(), `${resource}.query`)
          get({query, dispatch})
        }
      },

      handleSort: ({field, isAscending}) => {
        dbg('action: handle-sort: field=%o, is-ascending=%o', field, isAscending)
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

      handlePage: index => {
        dbg('action: handle-page: page=%o', index)
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

      handleMore: () => {
        dbg('action: handle-more')
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

      handleClear: () => {
        dbg('action: handle-clear')
        return dispatch => {
          dispatch(clear())
        }
      },

      handleClearItem: () => {
        dbg('action: handle-clear-item')
        return dispatch => {
          dispatch(clearItem())
        }
      },

      handleCreate: ({data}) => {
        dbg('action: handle-create: data=%o', data)
        return handleWrite({type: CREATE, promise: actions.create({data})})
      },

      handleUpdate: ({id, data}) => {
        dbg('action: handle-update: id=%o, data=%o', id, data)
        return handleWrite({type: UPDATE, promise: actions.update({id, data})})
      },

      handlePatch: ({id, data}) => {
        dbg('action: handle-patch: id=%o, data=%o', id, data)
        return handleWrite({type: PATCH, promise: actions.patch({id, data})})
      },

      handleDelete: ({id}) => {
        dbg('action: handle-delete: id=%o', id)
        return handleWrite({type: DELETE, promise: actions.delete({id})})
      },

      handleGet: ({id}) => {
        dbg('action: handle-get: id=%o', id)
        return dispatch => {
          dbg('action: handle-get: thunk: id=%o', id)
          dispatch({
            type: GET,
            promise: actions.get({id}),
            meta: {
              onSuccess: result => {
                dbg('handle-get: success: result=%o', result)
                onSuccess({dispatch, result})
              },
              onFailure: result => {
                dbg('handle-get: failure: result=%o', result)
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

        [CLEAR_ITEM]: (state, action) => {
          dbg('reducer: clear-item: state=%o, action=%o', state, action)
          return {
            ...state,
            item: null
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

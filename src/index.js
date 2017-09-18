import debug from 'debug'
import _ from 'lodash'
import {handleActions} from 'redux-actions'
import {handle} from 'redux-pack'

// index must return a promise that adheres to the contract:
// argument: {offset: 1, limit: 1, sort: {field: 'name', isAscending: true}}
// returns: {data: [{}], total: 1, query: {/* just returns input argument */}}
//
export default function({resource, index, limit = 10, onFailure}) {
  const dbg = debug(`lib:shared:page:${resource}`)

  const INDEX = `${resource}-page/index`
  const MORE = `${resource}-page/more`

  async function get({query, dispatch, scroll}) {
    dbg('get: query=%o, scroll=%o', query, scroll)
    const result = await dispatch({type: scroll ? MORE : INDEX, promise: index(query)})
    dbg('get: result=%o', result)
    if (result.error) {
      dispatch(onFailure(result.payload.message))
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
        }
      },
      {
        query: {
          limit,
          offset: 0,
          sort: {field: null, isAscending: true}
        },
        data: null,
        total: 0,
        active: 0,
        more: true,
        currentPage: 0,
        totalPages: 0
      }
    )
  }
}

function isMore({data, total}) {
  return data.length > 0 && total > data.length
}

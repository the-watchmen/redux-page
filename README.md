# redux-page

action/reducer combo to assist with paging against a restful data source

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

## usage

- uses [redux-pack](https://github.com/lelandrichardson/redux-pack), so need to follow directions and add middleware

- configure an instance with a promise based service that adheres to the following contract
    - input:
    ```js
    {offset: 1, limit: 1, sort: {field: 'name', isAscending: true}, ...fieldFilters}
    ```
    > `fieldFilters` (arbitrary name, just illustrating with [spread operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_operator#Spread_in_object_literals) above) are optional, but can contain resource specific filters like `{lastName: 'smith'}`
    - output:
    ```js
    {data: [{}], total: 1, query: {/* just returns input argument */}}
    ```

- obtain an instance of redux-page like below
    ```js
    import config from 'config'
    import getRedux from 'redux-page'
    import {feathers} from 'web-helpr'
    import {openSnackbar} from '../layout/layout-redux'

    const url = config.api.url
    const resource = 'people'
    const index = feathers.getIndex({url, resource})
    export default getRedux({resource: 'people', index, limit: 3, onFailure: openSnackbar})
    ```

- redux-page instance will be an object like below which can be used as in typical redux fashion:
    ```js
    {
      actions: {
        //...
      },
      reducer: function() {/* */}
    }
    ```

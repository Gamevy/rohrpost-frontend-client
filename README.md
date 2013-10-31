rohrpost-frontend-client
====================

A frontend cliend for rohrpost-server that works both in modern browsers and in nodejs.

```html
<!-- This is only needed in browser environments -->
<script src="/js/sockjs-0.3.min.js"/></script>
<script src="/js/rohrpost-client.js"/></script>

```
```javascript
// This is only needed for nodejs
var Rohrpost = require('rohrpost-frontend-client');

// This works for both environments
var rohrpost = new Rohrpost({
  'connectionUrl': 'http://yourdomain.com:12345/yourconnection', // This is needed 
  'proxy': 'http://localhost:8888' // This only works in nodejs
});

rohrpost.once('my.event', function(data) {
  console.log(data);
});

rohrpost.publish('my.published.event', {"foo": "bar"});

```

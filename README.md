# plugin-odem-etcd

connecting [Hitchy](http://hitchyjs.org)'s [ODM](https://hitchyjs.github.io/plugin-odem/) with [etcd](https://etcd.io/) cluster

## License

MIT

## About

[Hitchy](http://hitchyjs.org) is a server-side framework for developing web applications with [Node.js](https://nodejs.org). [Odem](https://hitchyjs.github.io/plugin-odem/) is a plugin for Hitchy implementing an _object document management_ (ODM) using data backends like regular file systems, LevelDBs and temporary in-memory databases.
 
This plugin is implementing another such data backend enabling data of Hitchy's ODM to be stored in an etcd-based cluster.


## Installation

Execute the following command in folder of your Hitchy-based application:

```bash
npm i hitchy-plugin-odem-etcd
```

It is installing this plugin and its dependency [hitchy-plugin-odem](https://www.npmjs.com/package/hitchy-plugin-odem). So, you may rely only on this plugin instead of listing **hitchy-plugin-odem** as a dependency yourself, as well.

## Usage

Select an instance of this backend as default adapter in your application's configuration by creating a file **config/database.js** with content similar to this:

```javascript
const File = require( "fs" );

module.exports = function() {
    return {
        database: {
            default : new this.runtime.services.OdemAdapterEtcd( {
                hosts: [
                    "https://10.0.1.1:2379",
                    "https://10.0.1.2:2379",
                    "https://10.0.1.3:2379",
                ],
                credentials: {
                    rootCertificate: File.readFileSync( "path/to/ca.pem" ),
                    certChain: File.readFileSync( "path/to/cert.pem" ),
                    privateKey: File.readFileSync( "path/to/key.pem" ),
                }
            } ),
        },
    };
};
```

Provided [options](https://mixer.github.io/etcd3/interfaces/options_.ioptions.html) are basically forwarded to [instance of Etcd3 created internally](https://mixer.github.io/etcd3/classes/namespace_.namespace.html).

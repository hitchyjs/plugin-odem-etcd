# plugin-odem-etcd

connecting [Hitchy](http://hitchyjs.org)'s [ODM](https://hitchyjs.github.io/plugin-odem/) with [etcd](https://etcd.io/) cluster

## License

MIT

## About

[Hitchy](http://hitchyjs.org) is a server-side framework for developing web applications with [Node.js](https://nodejs.org). [Odem](https://hitchyjs.github.io/plugin-odem/) is a plugin for Hitchy implementing an _object document management_ (ODM) using data backends like regular file systems, LevelDBs and temporary in-memory databases. Accessing either backend requires some _adapter_.
 
This plugin is implementing an adapter for storing data in an [etcd-based cluster](https://etcd.io/).


## Installation

Execute the following command in folder of your Hitchy-based application to install this adapter:

```bash
npm i hitchy-plugin-odem-etcd
```

The adapter depends on [hitchy-plugin-odem](https://www.npmjs.com/package/hitchy-plugin-odem), which in turn depends on [hitchy](https://www.npmjs.com/package/hitchy-core). Either dependency must be installed manually as well.

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
                retry: false,
                credentials: {
                    rootCertificate: File.readFileSync( "path/to/ca.pem" ),
                    certChain: File.readFileSync( "path/to/cert.pem" ),
                    privateKey: File.readFileSync( "path/to/key.pem" ),
                },
                auth: { username: "john.doe", password: "secret" },
                prefix: "common/prefix/user/can/readwrite",
            } ),
        },
    };
};
```

Most of provided [options](https://mixer.github.io/etcd3/interfaces/options_.ioptions.html) are forwarded to [instance of Etcd3 created internally](https://mixer.github.io/etcd3/classes/namespace_.namespace.html).

* `hosts` is a list of endpoint URLs of etcd cluster to connect with.

  The given example illustrates encrypted connections via https using IP addresses. Depending on your setup using host names may be available, as well.
   
* `retry` is a boolean controlling whether client should retry queries when one of the tested nodes in list isn't available or is having temporary issues. 

  This feature is enabled by default and so you don't need to provide it here unless you want to disable it.
  
* `credentials` is an object selecting a client TLS certificate for authenticating with the cluster.

  Using this feature is optional. However, using this might require connection encrypted via https, only.

* `auth` is an object providing authentication data for [role-based access control](https://etcd.io/docs/latest/op-guide/authentication/) (RBAC). It contains properties `username` and `password` containing either information in cleartext.

  It's okay to omit this when connecting with a cluster that doesn't use RBAC. You should consider RBAC when connecting different applications to a single etcd cluster.

In opposition to those, the following options are consumed by this adapter:

* `prefix` defines a common prefix to use on every read/write operation of current application.

  This defaults to `hitchy-odem` when omitted. We suggest using Unix-style path names. Leading and trailing forward slashes are ignored.

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

Select an instance of this backend as default adapter in your application's configuration like so:


/**
 * (c) 2020 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2020 cepharum GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @author: cepharum
 */

"use strict";

const { PassThrough } = require( "stream" );

const { Etcd3 } = require( "etcd3" );


/**
 * @typedef {object} IOptions see https://mixer.github.io/etcd3/interfaces/options_.ioptions.html
 */

/**
 * @typedef {IOptions} EtcdAdapterOptions
 * @property {string} prefix prefix to use on reading/writing keys from/in etcd cluster
 */


const DefaultOptions = {
	prefix: "hitchy-odem",
};


module.exports = function() {
	const api = this;
	const { services: Services } = api.runtime;

	const logDebug = api.log( "hitchy:odem:etcd:debug" );
	const logError = api.log( "hitchy:odem:etcd:error" );

	/**
	 * Implements adapter for saving odem models in an etcd cluster.
	 */
	class OdemEtcdAdapter extends Services.OdemAdapter {
		/**
		 * @param {EtcdAdapterOptions} options options selecting cluster to use
		 */
		constructor( options = {} ) {
			super();

			const _options = Object.assign( {}, DefaultOptions, options );
			const prefix = _options.prefix = _options.prefix == null ? "" : String( _options.prefix ).trim().replace( /\/+$/, "" ) + "/";


			const client = new Etcd3( _options );

			Object.defineProperties( this, {
				/**
				 * Exposes client connecting with etcd cluster.
				 *
				 * @name OdemEtcdAdapter#client
				 * @property {Etcd3}
				 * @readonly
				 */
				client: { value: prefix === "" ? client : client.namespace( prefix ) },

				/**
				 * Exposes prefix to use for mapping internal keys into those
				 * used in connected etcd cluster.
				 *
				 * @name OdemEtcdAdapter#prefix
				 * @property {string}
				 * @readonly
				 */
				prefix: { value: prefix },

				/**
				 * Exposes options eventually used for customizing adapter.
				 *
				 * @name OdemEtcdAdapter#options
				 * @property {object}
				 * @readonly
				 */
				options: {
					get: () => {
						const copy = {};
						const names = Object.keys( _options );
						const numNames = names.length;

						for ( let i = 0; i < numNames; i++ ) {
							const name = names[i];

							if ( name === "credentials" ) {
								copy[name] = "provided, but hidden";
							} else {
								copy[name] = _options[name];
							}
						}

						Object.defineProperty( this, "options", { value: copy } );

						return copy;
					},
					configurable: true,
				},

				// prevent this adapter from being sealed/frozen so event
				// listeners can be added
				$$doNotSeal$$: { value: true },
				$$doNotFreeze$$: { value: true },
			} );

			this.client.watch()
				.prefix( "" )
				.create()
				.then( watcher => {
					logDebug( "setting up watcher for remote changes at %j", this.options.hosts );

					watcher
						.on( "error", error => {
							logError( "etcd error: %s", error.message );
						} )
						.on( "disconnected", () => {
							logDebug( "disconnected from cluster" );
						} )
						.on( "connected", () => {
							logDebug( "connected with cluster" );
						} )
						.on( "put", res => {
							let value;

							// TODO fetch previous revision of changed record from etcd to provide oldValue below

							try {
								value = JSON.parse( res.value );
							} catch ( error ) {
								logError( "got change notification with invalid data: %s", error.message );
							}

							const key = res.key.toString( "utf8" );

							logDebug( "got remote change notification on %s", key );

							this.emit( "change", key, value );
						} )
						.on( "delete", res => {
							const key = res.key.toString( "utf8" );

							logDebug( "got remote removal notification on %s", key );

							this.emit( "delete", key );
						} );
				} )
				.catch( error => {
					logError( "FATAL: setting up watcher for cluster-side changes of data failed: %s", error.stack );
				} );
		}

		/**
		 * Drops all data available via current adapter.
		 *
		 * @note This method is primarily meant for use while testing. It might be
		 *       useful in similar situations as well, like uninstalling some app.
		 *
		 * @returns {Promise} promises purging all data available via current adapter
		 * @abstract
		 */
		purge() {
			return this.client.delete().all().then( () => undefined );
		}

		/**
		 * Puts provided data in storage assigning new unique key.
		 *
		 * @param {string} keyTemplate template of key containing %u to be replaced with assigned UUID
		 * @param {object} data record to be written
		 * @returns {Promise.<string>} promises unique key of new record
		 * @abstract
		 */
		create( keyTemplate, data ) {
			const that = this;

			return this.client.lock( keyTemplate )
				.do( () => new Promise( ( resolve, reject ) => {
					attempt( 0, 100 );

					/**
					 * Implements single attempt for writing key with random
					 * UUID without overwriting some existing one.
					 *
					 * @param {int} current index of current iteration
					 * @param {int} stopAt max. number of iterations before failing
					 * @returns {void}
					 */
					function attempt( current, stopAt ) {
						if ( current >= stopAt ) {
							reject( new Error( "could not find available UUID after reasonable number of attempts" ) );
						} else {
							Services.OdemUtilityUuid.create()
								.then( uuid => {
									const key = keyTemplate.replace( /%u/g, Services.OdemUtilityUuid.format( uuid ) );

									return that.client.get( key )
										.then( value => {
											if ( value == null ) {
												logDebug( "creating entry at %s containing %j", key, data );

												return that.client.put( key )
													.value( JSON.stringify( data ) )
													.then( () => resolve( key ) );
											}

											process.nextTick( attempt, current + 1, stopAt );

											return undefined;
										} );
								} )
								.catch( reject );
						}
					}
				} ) );
		}

		/**
		 * Checks if provided key exists.
		 *
		 * @param {string} key unique key of record to test
		 * @returns {Promise.<boolean>} promises information if key exists or not
		 * @abstract
		 */
		has( key ) {
			return this.client().get( key )
				.then( () => true )
				.catch( error => {
					// FIXME distinguish fatal errors from desired ones due to missing selected key
					logDebug( "testing key %s caused error: %s", key, error.stack );

					return false;
				} );
		}

		/**
		 * Reads data selected by provided key.
		 *
		 * @param {string} key unique key of record to read
		 * @param {object} ifMissing data object to return if selected record is missing
		 * @returns {Promise.<object>} promises read data
		 * @abstract
		 */
		read( key, { ifMissing = null } = {} ) {
			logDebug( "fetching entry at %s", key );

			return this.client.get( key )
				.then( value => {
					return value == null ? ifMissing : JSON.parse( value );
				} );
		}

		/**
		 * Writes provided data to given key.
		 *
		 * @note To support REST API in hitchy-plugin-odem-rest this method must be
		 *       capable of writing to record that didn't exist before, thus
		 *       creating new record with provided key.
		 *
		 * @param {string} key unique key of record to be written
		 * @param {object} data record to be written
		 * @returns {Promise.<object>} promises provided data
		 * @abstract
		 */
		write( key, data ) {
			logDebug( "updating entry at %s with %j", key, data );

			return this.client.put( key ).value( JSON.stringify( data ) ).then( () => data );
		}

		/**
		 * Removes data addressed by given key.
		 *
		 * @note Removing some parent key includes removing all subordinated keys.
		 *
		 * @param {string} key unique key of record to be removed
		 * @returns {Promise.<key>} promises key of removed data
		 * @abstract
		 */
		remove( key ) {
			logDebug( "removing entry at %s", key );

			return this.client.delete( key ).then( () => key );
		}

		/**
		 * Retrieves stream of available keys.
		 *
		 * @param {string} prefix stream keys with given prefix, only
		 * @param {int} maxDepth skip keys beyond this depth (relative to `prefix`)
		 * @param {string} separator consider this character separating segments of key selecting different depth, set null to disable depth processing
		 * @returns {Readable} stream of keys
		 * @abstract
		 */
		keyStream( { prefix = "", maxDepth = Infinity, separator = "/" } = {} ) {
			const stream = new PassThrough( { objectMode: true } );

			const _prefix = prefix == null || prefix === "" ? "" : String( prefix ).trim().replace( /\/+$/, "" );
			const ns = _prefix === "" ? this.client : this.client.namespace( _prefix + "/" );

			logDebug( "streaming keys from %s", _prefix === "" ? _prefix : "<root>" );

			ns.getAll().keys()
				.then( keys => {
					logDebug( "got %d raw etcd-side key(s)%s", keys.length );

					const numKeys = keys.length;
					const children = new Map();

					// extract list of unique UUIDs
					for ( let read = 0; read < numKeys; read++ ) {
						let key = keys[read];

						if ( maxDepth < Infinity ) {
							key = key.split( separator ).slice( 0, maxDepth ).join( separator );
						}

						children.set( _prefix + "/" + key, true );
					}

					logDebug( "got %d unique odem-side key(s)", children.size );

					_write( 0, Array.from( children.keys() ) );

					/**
					 * Pushes items into writable stream pausing whenever
					 * hitting the stream's highWaterMark.
					 *
					 * @param {int} cursor index of next item to write
					 * @param {Array} items set of items to be written
					 * @returns {void}
					 */
					function _write( cursor, items ) {
						const numItems = items.length;

						for ( let i = cursor; i < numItems; i++ ) {
							if ( !stream.write( items[i] ) ) {
								stream.once( "drain", () => _write( i + 1, items ) );
								return;
							}
						}

						stream.end();
					}
				} )
				.catch( error => stream.destroy( error ) );

			return stream;
		}

		/**
		 * Maps some key to relative pathname to use on addressing related record in
		 * backend.
		 *
		 * @note This is available e.g. for splitting longer IDs into several path
		 *       segments e.g. for limiting number of possible files per folder in a
		 *       file-based backend.
		 *
		 * @param {string} key key to be mapped
		 * @returns {string} related path name to use for actually addressing entity in backend
		 */
		static keyToPath( key ) {
			return key;
		}

		/**
		 * Maps some relative pathname to use on addressing related record in
		 * backend into related key.
		 *
		 * @note This is available to reverse process of Adapter.keyToPath().
		 *
		 * @param {string} path path name addressing some entity in backend
		 * @returns {string} unique key for addressing selected entity
		 */
		static pathToKey( path ) {
			return path;
		}

		/**
		 * Starts transaction on current adapter.
		 *
		 * @returns {Promise} promises current connection granted transaction
		 */
		begin() {
			return Promise.reject( new Error( "missing transaction support" ) );
		}

		/**
		 * Cancels all modifications to data in current transaction.
		 *
		 * @returns {Promise} promises transaction rolled back
		 */
		rollBack() {
			return Promise.reject( new Error( "There is no running transaction to be rolled back." ) );
		}

		/**
		 * Commits all modifications to data in current transaction ending the
		 * latter.
		 *
		 * @returns {Promise} promises transaction rolled back
		 */
		commit() {
			return Promise.reject( new Error( "There is no running transaction to be committed." ) );
		}

		/**
		 * Indicates if adapter is capable of storing Buffer as property value.
		 *
		 * This information can be used by property type handlers on serializing
		 * data for storing via this adapter.
		 *
		 * @returns {boolean} true if adapter can save binary buffers as property value
		 */
		static get supportsBinary() { return false; }
	}

	return OdemEtcdAdapter;
};

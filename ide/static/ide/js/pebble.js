/**
 * Created by katharine on 1/15/15.
 */

var ConnectionType = {
    None: 0,
    Phone: 1,
    Qemu: 2,
    QemuAplite: 6,
    QemuBasalt: 10
};

var ConnectionPlatformNames = {
    2: 'aplite',
    6: 'aplite',
    10: 'basalt'
};

var SharedPebble = new (function() {
    var self = this;
    var mPebble = null;
    var mConnectionType = ConnectionType.None;
    var mEmulator = null;

    _.extend(this, Backbone.Events);

    var LOADING_STATEMENTS = [
        gettext("Reticulating splines…"),
        gettext("Eroding cliffs…"),
        gettext("Charging watches…"),
        gettext("Focusing camera…"),
        gettext("Rendering cats…"),
        gettext("Solving climate change…"),
        gettext("Kickstarting emulator project…"),
        gettext("Herding cats…"),
        gettext("Polishing monocles…"),
        gettext("Drafting master plans…"),
        gettext("Petting unicorns…"),
        gettext("Firing missiles…"),
        gettext("Never giving you up…"),
        gettext("Never letting you down…"),
        // Translators: do whatever you like with this one.
        gettext("Harmonising Elements…") // yes.
    ];

    function _getEmulator(kind, deferred) {
        var statementInterval = null;
        var randomStatements = LOADING_STATEMENTS.slice(0);

        CloudPebble.Prompts.Progress.Show(gettext("Booting emulator…"), gettext("Booting emulator..."));
        statementInterval = setInterval(function() {
            if(statementInterval === null) return;
            CloudPebble.Prompts.Progress.Update(pickElement(randomStatements));
        }, 2500);

        mEmulator = new QEmu(ConnectionPlatformNames[kind], $('#emulator-container canvas'), {
            up: $('#emulator-container .up'),
            select: $('#emulator-container .select'),
            down: $('#emulator-container .down'),
            back: $('#emulator-container .back'),
        });
        window.emu = mEmulator;
        mEmulator.on('disconnected', function() {
            $('#sidebar').removeClass('with-emulator');
            mEmulator = null;
        });
        $('#sidebar').addClass('with-emulator');

        mEmulator.connect().done(function() {
            deferred.resolve();
        }).fail(function(reason) {
            deferred.reject(reason);
        }).always(function() {
            clearInterval(statementInterval);
        });
        mEmulator.on('disconnected', handleEmulatorDisconnected);
    }

    this.getEmulator = function(kind) {
        var deferred = $.Deferred();
        if(mEmulator != null) {
            if(kind == mConnectionType) {
                deferred.resolve(mEmulator);
                return deferred.promise();
            } else {
                mEmulator.once('disconnected', function() { _getEmulator(kind, deferred); })
                mEmulator.disconnect(true);
                mEmulator = null;
                return deferred.promise();
            }
        }
        _getEmulator(kind, deferred);
        return deferred.promise();
    };

    function handleEmulatorDisconnected() {
        if(mPebble && (mConnectionType & ConnectionType.Qemu)) {
            mPebble.close();
            mEmulator = null;
        }
    }

    this.getPebble = function(kind) {
        var deferred = $.Deferred();
        if(mPebble && mPebble.is_connected()) {
            if(kind === undefined || mConnectionType == kind || (kind == ConnectionType.Qemu && self.isVirtual())) {
                deferred.resolve(mPebble);
                return deferred.promise();
            }
        }

        var watchPromise;
        var statementInterval = null;

        if(kind & ConnectionType.Qemu) {
            watchPromise = self.getEmulator(kind);
        } else {
            watchPromise = $.Deferred().resolve();
        }
        watchPromise
            .done(function() {
                var did_connect = false;
                mConnectionType = kind;
                CloudPebble.Prompts.Progress.Show(gettext("Connecting..."), gettext("Establishing connection..."), function() {
                    if(!did_connect && mPebble) {
                        mPebble.off();
                        mPebble.close();
                        mPebble = null;
                        deferred.reject("Connection interrupted.");
                    }
                });
                mPebble = new Pebble(getWebsocketURL(), getToken());
                mPebble.on('all', handlePebbleEvent);
                mPebble.on('proxy:authenticating', function() {
                    CloudPebble.Prompts.Progress.Update(gettext("Authenticating..."));
                });
                mPebble.on('proxy:waiting', function() {
                    CloudPebble.Prompts.Progress.Update(gettext("Waiting for phone. Make sure the developer connection is enabled."));
                });
                var connectionError = function() {
                    mPebble.off();
                    CloudPebble.Prompts.Progress.Fail();
                    CloudPebble.Prompts.Progress.Update(gettext("Connection interrupted."));
                    mPebble = null;
                    deferred.reject("Connection interrupted");
                };
                mPebble.on('close error', connectionError);
                mPebble.on('open', function() {
                    if(self.isVirtual()) {
                        // Set the clock to localtime.
                        var date = new Date();
                        mPebble.set_time(date.getTime() - date.getTimezoneOffset() * 60000);
                        console.log("setting pebble clock to localtime.");
                    }
                    mPebble.enable_app_logs();
                    did_connect = true;
                    mPebble.off(null, connectionError);
                    mPebble.off('proxy:authenticating proxy:waiting');
                    CloudPebble.Prompts.Progress.Hide();
                    deferred.resolve(mPebble);
                });
            })
            .fail(function(reason) {
                mEmulator = null;
                CloudPebble.Prompts.Progress.Fail();
                CloudPebble.Prompts.Progress.Update(interpolate(gettext("Emulator boot failed: %s"), ["out of capacity."]));
                $('#sidebar').removeClass('with-emulator');
                deferred.reject(reason);
            });
        return deferred.promise();
    };

    this.getPebbleNow = function() {
        return mPebble;
    };

    this.disconnect = function(shutdown) {
        if(mPebble) {
            mPebble.disable_app_logs();
            mPebble.off();
            mPebble.close();
            mPebble = null;
            mConnectionType = ConnectionType.None;
        }
        if(shutdown === true && mEmulator) {
            mEmulator.disconnect();
            mEmulator = null;
        }
    };

    this.isVirtual = function() {
        return mPebble && !!(mConnectionType & ConnectionType.Qemu);
    };

    function getWebsocketURL() {
        return (mConnectionType & ConnectionType.Qemu)? mEmulator.getWebsocketURL() : LIBPEBBLE_PROXY;
    }

    function getToken() {
        return (mConnectionType & ConnectionType.Qemu) ? mEmulator.getToken() : USER_SETTINGS.token;
    }

    function pickElement(elements) {
        if(elements.length == 0) {
            return "…";
        }
        var index = Math.floor(Math.random() * elements.length);
        return elements.splice(index, 1)[0];
    }

    function handlePebbleEvent() {
        var args = Array.prototype.slice.call(arguments, 0);
        var event = args.shift();
        self.trigger.apply(self, [event, mPebble].concat(args));
    }
})();

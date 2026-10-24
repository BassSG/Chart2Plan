var AF_DEMO = {
  "schemaVersion": 1,
  "asOf": 600000,
  "market": {
    "symbol": "TEST",
    "tick": 0.1,
    "cost": 0.1,
    "tfMs": 60000
  },
  "bar": {
    "openTime": 540000,
    "closeTime": 600000,
    "open": 100,
    "high": 100.5,
    "low": 99.8,
    "close": 100,
    "atr": 1,
    "confirmed": true
  },
  "allindy": {
    "sourceVersion": "All-Indy-1.3.5",
    "symbol": "TEST",
    "tfMs": 60000,
    "knownAt": 600000,
    "signalClose": 600000,
    "confirmed": true,
    "historyComplete": true,
    "zoneValid": true,
    "finalSignal": true,
    "zoneId": "z1",
    "signalId": "s1",
    "side": 1,
    "entry": 100,
    "stop": 99,
    "target": 103
  },
  "fibo": {
    "sourceVersion": "EBW-Fibo-1.10.19",
    "symbol": "TEST",
    "tfMs": 300000,
    "knownAt": 600000,
    "sourceClose": 600000,
    "born": 300000,
    "zero": 97,
    "span": 2,
    "root": 96,
    "side": 1,
    "method": 1,
    "broken": true,
    "invalidated": false,
    "historyComplete": true,
    "id": "f1",
    "hitRatios": [],
    "targets": [
      {
        "ratio": 2.618,
        "price": 102.236,
        "pending": true
      }
    ]
  },
  "guards": {
    "news": "CLEAR",
    "risk": "CLEAR",
    "data": "CLEAR"
  }
};

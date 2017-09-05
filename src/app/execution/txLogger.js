'use strict'
var yo = require('yo-yo')

// -------------- styling ----------------------
var csjs = require('csjs-inject')
var remix = require('ethereum-remix')
var styleGuide = remix.ui.styleGuide
var styles = styleGuide()

var EventManager = remix.lib.EventManager
var helper = require('../../lib/helper')
var ethJSUtil = require('ethereumjs-util')
var BN = ethJSUtil.BN
var executionContext = require('../../execution-context')

var css = csjs`
  .log {
    display: flex;
    align-items: baseline;
  }
  .txTable, .tr, .td {
    border: 1px solid ${styles.colors.orange};
    border-collapse: collapse;
    font-size: 10px;
    color: ${styles.colors.grey};
  }
  #txTable {
    width: 450px;
    margin-top: 10px;
    align-self: center;
  }
  .tr, .td {
    padding: 4px;
  }
  .buttons {
    display: flex;
  }
  .debug, .details {
    ${styles.button}
    min-height: 18px;
    max-height: 18px;
    width: 45px;
    min-width: 45px;
    font-size: 10px;
    margin-left: 5px;
  }
  .debug {
    background-color: ${styles.colors.lightOrange};
  }
  .details {
    background-color: ${styles.colors.lightGrey};
  }
`
/**
  * This just export a function that register to `newTransaction` and forward them to the logger.
  * Emit debugRequested
  *
  */
class TxLogger {
  constructor (opts = {}) {
    this.event = new EventManager()
    this.opts = opts
    opts.api.editorpanel.registerLogType('knownTransaction', (data) => {
      return renderKnownTransaction(this, data)
    })
    opts.api.editorpanel.registerLogType('unknownTransaction', (data) => {
      return renderUnknownTransaction(this, data)
    })
    opts.api.editorpanel.registerLogType('emptyBlock', (data) => {
      return renderEmptyBlock(this, data)
    })

    opts.events.txListener.register('newBlock', (block) => {
      if (!block.transactions.length) {
        opts.api.editorpanel.log({type: 'emptyBlock', value: { block: block }})
      }
    })

    opts.events.txListener.register('newTransaction', (tx) => {
      log(this, tx, opts.api)
    })
  }
}

function log (self, tx, api) {
  var resolvedTransaction = api.resolvedTransaction(tx.hash)
  if (resolvedTransaction) {
    api.parseLogs(tx, resolvedTransaction.contractName, api.compiledContracts(), (error, logs) => {
      if (!error) {
        api.editorpanel.log({type: 'knownTransaction', value: { tx: tx, resolvedData: resolvedTransaction, logs: logs }})
      }
    })
  } else {
    // contract unknown - just displaying raw tx.
    api.editorpanel.log({ type: 'unknownTransaction', value: { tx: tx } })
  }
}

function renderKnownTransaction (self, data) {
  var from = helper.shortenAddress(data.tx.from)
  var to = ''

  if (data.tx.blockHash) {
    to = helper.shortenAddress(data.tx.to)
  } else if (data.tx.hash) {  // call (constructor of function call)
    var name = data.resolvedData.contractName + '.' + data.resolvedData.fn
    var logs = ',' + ' 0 logs'
    if (data.resolvedData.fn === '(constructor)') {
      to = name + logs
      from = from + ' ' + name + logs
    } else {
      var toHash = helper.shortenAddress(data.resolvedData.to)
      to = name + ' ' + toHash + logs
      from = from + ' ' + name + logs
    }
  }

  function debug () {
    self.event.trigger('debugRequested', [data.tx.hash])
  }
  var tx = yo`
    <span class=${css.container} id="tx${data.tx.hash}">
      <div class="${css.log}">
        ${context(self, data.tx)}, ${data.resolvedData.contractName}.${data.resolvedData.fn}, ${data.logs.length} logs
        <div class=${css.buttons}>
        <button class=${css.details} onclick=${txDetails}>Details</button>
        <button class=${css.debug} onclick=${debug}>Debug</button>
        </div>
      </div>
    </span>
  `

  var table
  function txDetails () {
    if (table && table.parentNode) {
      tx.removeChild(table)
    } else {
      table = createTable({
        from, to, val: data.tx.value, input: data.tx.input, hash: data.tx.hash
      })
      tx.appendChild(table)
    }
  }

  return tx
}

function renderUnknownTransaction (self, data) {
  var from = helper.shortenAddress(data.tx.from)
  var to = data.tx.to
  if (to) to = helper.shortenAddress(data.tx.to)
  function debug () {
    self.event.trigger('debugRequested', [data.tx.hash])
  }
  var tx = yo`
    <span class=${css.container} id="tx${data.tx.hash}">
      <div class="${css.log}">
        ${context(self, data.tx)}
        <div class=${css.buttons}>
          <button class=${css.details} onclick=${txDetails}>Details</button>
          <button class=${css.debug} onclick=${debug}>Debug</button>
        </div>
      </div>
    </span>
  `
  var table
  function txDetails () {
    if (table && table.parentNode) {
      tx.removeChild(table)
    } else {
      table = createTable({
        from, to, val: data.tx.value, input: data.tx.input, hash: data.tx.hash
      })
      tx.appendChild(table)
    }
  }
  return tx
}

function renderEmptyBlock (self, data) {
  return yo`<span>block ${data.block.number} - O transactions</span>`
}

function context (self, tx) {
  if (executionContext.getProvider() === 'vm') {
    return yo`<span>(vm)</span>`
  } else {
    return yo`<span>block:${tx.blockNumber}, txIndex:${tx.transactionIndex}</span>`
  }
}

function value (v) {
  try {
    if (v.indexOf && v.indexOf('0x') === 0) {
      return (new BN(v.replace('0x', ''), 16)).toString(10)
    } else {
      return v.toString(10)
    }
  } catch (e) {
    console.log(e)
    return v
  }
}

module.exports = TxLogger

// helpers

function createTable (opts) {
  var from = opts.from
  var to = opts.to
  var val = opts.val
  var input = opts.input
  var hash = opts.hash
  return yo`
  <table class="${css.txTable}" id="txTable">
    <tr class="${css.tr}">
      <td class="${css.td}">from</td>
      <td class="${css.td}">${from}</td>
    </tr class="${css.tr}">
    <tr class="${css.tr}">
      <td class="${css.td}">to:</td>
      <td class="${css.td}">${to}</td>
    </tr class="${css.tr}">
    <tr class="${css.tr}">
      <td class="${css.td}">value:</td>
      <td class="${css.td}">${value(val)} wei</td>
    </tr class="${css.tr}">
    <tr class="${css.tr}">
      <td class="${css.td}">data:</td>
      <td class="${css.td}">${helper.shortenHexData(input)}</td>
    </tr class="${css.tr}">
    <tr class="${css.tr}">
      <td class="${css.td}">hash:</td>
      <td class="${css.td}">${helper.shortenHexData((hash))}</td>
    </tr class="${css.tr}">
  </table>
  `
}

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
    justify-content: space-between;
  }
  .txBlock, .txVM {
    color: ${styles.colors.violet};
    width: 45%;
  }
  .txTable, .tr, .td {
    border-collapse: collapse;
    font-size: 10px;
    color: ${styles.colors.grey};
    border: 1px dashed ${styles.colors.black};
  }
  #txTable {
    width: 450px;
    margin-top: 10px;
    align-self: center;
  }
  .tr, .td {
    padding: 4px;
  }
  .tableTitle {
    width: 25%;
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
  var from = data.tx.from
  var to = ''

  if (data.tx.blockHash) {
    to = data.tx.to
  } else if (data.tx.hash) {  // call (constructor of function call)
    if (data.resolvedData.fn === '(constructor)') {
      to = data.resolvedData.contractName + '.' + data.resolvedData.fn
    } else {
      to = data.resolvedData.to
    }
  }

  function debug () {
    self.event.trigger('debugRequested', [data.tx.hash])
  }
  var tx = yo`
    <span class=${css.container} id="tx${data.tx.hash}">
      <div class="${css.log}">
        ${context(self, data)}
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
        contractAddress: data.tx.contractAddress,
        data: data.tx.data,
        from,
        to,
        gas: data.tx.gas,
        hash: data.tx.has,
        input: data.tx.input,
        logs: JSON.stringify(data.tx.logs) || '0',
        val: data.tx.value
      })
      tx.appendChild(table)
    }
  }

  return tx
}

function renderUnknownTransaction (self, data) {
  var from = data.tx.from
  var to = data.tx.to
  function debug () {
    self.event.trigger('debugRequested', [data.tx.hash])
  }
  var tx = yo`
    <span class=${css.container} id="tx${data.tx.hash}">
      <div class="${css.log}">
        ${context(self, data)}
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
        from, to, val: data.tx.value, input: data.tx.input, hash: data.tx.hash, gas: data.tx.gas, logs: JSON.stringify(data.tx.logs) || '0'
      })
      tx.appendChild(table)
    }
  }
  return tx
}

function renderEmptyBlock (self, data) {
  return yo`<span>block ${data.block.number} - O transactions</span>`
}

function context (self, data) {
  var from = helper.shortenHexData(data.tx.from)
  var to = ''
  if (executionContext.getProvider() === 'vm') {
    if (data.resolvedData.to) {
      to = `${data.resolvedData.contractName}.${data.resolvedData.fn}, ${helper.shortenHexData(data.resolvedData.to)}`
    } else {
      to = `${data.resolvedData.contractName}.${data.resolvedData.fn}`
    }
    return yo`<span><span class='${css.txVM}'>[vm]</span> from: ${from}, to:${to}, value:${data.tx.value} wei</span>`
  } else {
    var hash = helper.shortenHexData(data.tx.blockHash)
    var block = data.tx.blockNumber
    var i = data.tx.transactionIndex
    var val = data.tx.value
    return yo`<span><span class='${css.txBlock}'>[block:${block} txIndex:${i}]</span> from:${from}, to:${hash}, value:${value(val)} wei</span>`
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
  var table = yo`<table class="${css.txTable}" id="txTable"></table>`
  var contractAddress = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> contractAddress </td>
      <td class="${css.td}">${opts.contractAddress}</td>
    </tr class="${css.tr}">
  `
  if (opts.contractAddress) table.appendChild(contractAddress)
  var data = helper.shortenHexData(opts.input)
  data = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> data </td>
      <td class="${css.td}">${data}</td>
    </tr class="${css.tr}">
  `
  if (opts.data) table.appendChild(data)
  var from = yo`
    <tr class="${css.tr}">
      <td class="${css.td} ${css.tableTitle}"> from </td>
      <td class="${css.td}">${opts.from}</td>
    </tr class="${css.tr}">
  `
  if (opts.from) table.appendChild(from)
  var to = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> to </td>
      <td class="${css.td}">${opts.to}</td>
    </tr class="${css.tr}">
  `
  if (opts.to) table.appendChild(to)
  var gas = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> gas </td>
      <td class="${css.td}">${opts.gas}</td>
    </tr class="${css.tr}">
  `
  if (opts.gas) table.appendChild(gas)
  var hash = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> hash </td>
      <td class="${css.td}">${opts.hash}</td>
    </tr class="${css.tr}">
  `
  if (opts.hash) table.appendChild(hash)
  var input = helper.shortenHexData(opts.input)
  input = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> input </td>
      <td class="${css.td}">${input}</td>
    </tr class="${css.tr}">
  `
  if (opts.input) table.appendChild(input)
  var logs = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> logs </td>
      <td class="${css.td}">${opts.logs || '0'}</td>
    </tr class="${css.tr}">
  `
  if (opts.logs) table.appendChild(logs)
  var val = value(opts.val)
  val = yo`
    <tr class="${css.tr}">
      <td class="${css.td}"> value </td>
      <td class="${css.td}">${val} wei</td>
    </tr class="${css.tr}">
  `
  if (opts.val) table.appendChild(val)
  return table
}

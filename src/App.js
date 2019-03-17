import React, { Component } from 'react'
import RockPaperScissorsContract from '../build/contracts/RockPaperScissors.json'
import getWeb3 from './utils/getWeb3'

import Firebase from "firebase";
import config from "./config";

import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'

const Promise = require("bluebird");
const assert = require('assert-plus');
const cloneDeep = require('lodash.clonedeep');
const Contract = require('truffle-contract');

const contractStates = ["Running", "Paused", "Killed"]
const RockPaperScissors = Contract(RockPaperScissorsContract)

class Player extends Component {

  constructor(props) {
    super(props)
    this.state = {
      password: "",
      balance: this.props.balance,
      stake: this.props.stake,
      currentGame: 0,
      move: 1,
      amountToPlayWith: 1,
      amountToWithdraw: 1
    };
  }

  followUpTransaction = async (txHash) => {
    console.log("Your transaction is on the way, waiting to be mined!", txHash);
    let receipt = await this.props.web3.eth.getTransactionReceiptMined(txHash);
    // eslint-disable-next-line
    assert.strictEqual(parseInt(receipt.status), 1);
    console.log("Your transaction executed successfully!");
    this.props.updateStakes();
    return true;
  }
  
  configureGame = () => {
    let amountToPlayWith = 1;
    if(this.amountToPlayWith.value > 0) {
      amountToPlayWith = this.amountToPlayWith.value;
    }
    this.setState({ 
      currentGame: this.gameSelect.value, 
      move: this.moveSelect.value, 
      password: this.password.value, 
      amountToPlayWith: amountToPlayWith
    });
  }

  updateAmountToWithdraw = () => {
    let amountToWithdraw = 1;
    if(this.amountToWithdraw.value > 0) {
      amountToWithdraw = this.amountToWithdraw.value;
    }
    this.setState({ amountToWithdraw });
  }

  setCurrentGame = (gameHash) => {
    this.setState({ currentGame: this.props.games.indexOf(gameHash) });
  }

  startGame = async () => {
    let gameHash = await this.props.RockPaperScissorsInstance.encryptMove(this.state.move, this.state.password, { from: this.props.address });    
    let txHash = await this.props.RockPaperScissorsInstance.startGame.sendTransaction(gameHash, this.props.convertToWei(this.state.amountToPlayWith), 10, {from: this.props.address, gas: 3000000, value: this.props.convertToWei(this.state.amountToPlayWith)})
    let success = await this.followUpTransaction(txHash);
    console.log(success);
    this.props.updateGames(gameHash);
    this.setCurrentGame(gameHash);
  }

  joinGame = async () => {
    let gameHash = this.props.games[this.state.currentGame];
    let encryptedMove = await this.props.RockPaperScissorsInstance.encryptMove(this.state.move, this.state.password, { from: this.props.address })
    let txHash = await this.props.RockPaperScissorsInstance.joinGame.sendTransaction(gameHash, encryptedMove, {from: this.props.address, gas: 3000000, value: this.props.convertToWei(this.state.amountToPlayWith)})
    let success = await this.followUpTransaction(txHash);
    console.log(success);
  }

  revealMove = async () => {
    let gameHash = this.props.games[this.state.currentGame];
    let txHash = await this.props.RockPaperScissorsInstance.revealMove.sendTransaction(this.state.move, this.state.password, gameHash, {from: this.props.address, gas: 3000000})
    let success = await this.followUpTransaction(txHash);
    console.log(success);
  }

  withdrawFunds = async () => {
    let txHash = await this.props.RockPaperScissorsInstance.withdrawEther.sendTransaction(this.props.convertToWei(this.state.amountToWithdraw), {from: this.props.address})
    let success = await this.followUpTransaction(txHash);
    console.log(success);
  }

  pullOutFromGame = async () => {
    let gameHash = this.props.games[this.state.currentGame];
    let txHash = await this.props.RockPaperScissorsInstance.pullOutFromGame.sendTransaction(gameHash, {from: this.props.address})
    let success = await this.followUpTransaction(txHash);
    console.log(success);
  }

  render() {
    return (
      <div>
        <p>Balance: {this.props.balance}</p>
        <p>Stake: {this.props.stake}</p>

        <span>Amount to withdraw (in Ether): </span>
        <input placeholder="1" ref={(ref) => this.amountToWithdraw = ref} onChange={this.updateAmountToWithdraw}/>
        <button onClick={() => this.withdrawFunds() }>Withdraw</button>
        <br/>
        
        <span>Password: </span>
        <input ref={(ref) => this.password = ref} onChange={this.configureGame}/>
        <br/>

        <span>Select your Move:</span>
        <select ref={(ref) => this.moveSelect = ref} onChange={this.configureGame}>
          <option key="1" value="1">Rock</option>
          <option key="2" value="2">Paper</option>
          <option key="3" value="3">Scissors</option>
        </select>
        <br/>

        <p>Select Game to participate or start your own game:</p>
        <select ref={(ref) => this.gameSelect = ref} onChange={this.configureGame}>{this.props.games.map((x,y) => <option key={x}>{y}</option>)}</select>
        <button onClick={() => this.joinGame() }>Join Game</button>
        <button onClick={() => this.startGame() }>Start Game</button>
        <button onClick={() => this.revealMove() }>Reveal Move</button>
        <button onClick={() => this.pullOutFromGame() }>Pull out from game</button>

        <br/>
        <span>Amount to play with (in Ether): </span>
        <input placeholder="1" ref={(ref) => this.amountToPlayWith = ref} onChange={this.configureGame}/>
        
        
      </div>
    );
  }

}

class App extends Component {

  renderPlayer(i) {
    if(this.state.players[i]) {
      return (
        <Player
          address={this.state.players[i].address}
          balance={this.state.players[i].balance}
          stake={this.state.players[i].stake}
          games={this.state.games}
          RockPaperScissorsInstance={this.state.RockPaperScissorsInstance}
          web3={this.state.web3}
          updateGames={this.updateGames}
          updateStakes={() => this.updateStakes()}
          convertToEther={(value) => this.convertToEther(value)}
          convertToWei={(value) => this.convertToWei(value)}          
        />
      );
    } else {
      return false;
    }    
  }

  constructor(props) {
    super(props)
    Firebase.initializeApp(config);
    this.state = {
      status: "",
      web3: null,
      RockPaperScissorsInstance: null,
      account: null,
      players: [],
      games: []
    };
  }

  async componentDidMount() {
    this.readFromDB();
    let results = await this.getWeb3();
    await this.updateComponents(results);
    await this.instantiateContract();    
  }

  writeToDB = () => {
    Firebase.database()
      .ref("/")
      .set(this.state.games);
    console.log("DATA SAVED");
  };

  readFromDB = () => {
    let ref = Firebase.database().ref("/");
    ref.on("value", snapshot => {
      const state = snapshot.val();
      if(state) {
        this.setState({
          games: state
        });
      }      
    });
  };

  async getWeb3() {
    return await getWeb3
  }

  async updateComponents(results) {
      results.web3.eth.getTransactionReceiptMined = require("./utils/getTransactionReceiptMined.js");
      // Promisify all functions of web3.eth and web3.version
      Promise.promisifyAll(results.web3.eth, { suffix: "Promise" });
      Promise.promisifyAll(results.web3.version, { suffix: "Promise" });
      this.setState({
        web3: results.web3
      })
  }

  async instantiateContract() {
    
    RockPaperScissors.setProvider(this.state.web3.currentProvider)
    
    let instance = await RockPaperScissors.deployed()
    let accounts = await this.state.web3.eth.getAccountsPromise()

    if (accounts.length < 3){
      throw new Error("No available accounts!");
    }

    let players = [];

    for (let index = 0; index < accounts.length; index++) {
      const account = accounts[index];
      let balance = this.convertToEther(await this.state.web3.eth.getBalancePromise(account));
      let stake = this.convertToEther(await instance.balances(account));
      let currentGame = 0;
      let move = 1;
      let password = "";
      let player = {"address": account, balance, stake, currentGame, move, password};
      players.push(player);
    }

    let status = await instance.getState({from: players[0].address})
    
    this.setState({
      RockPaperScissorsInstance: instance,
      account: players[0].address,
      players: players,
      status: contractStates[status.toString()]
    });
    
  }

  updateGames = async (gameHash) => {
    const games = cloneDeep(this.state.games);
    games.push(gameHash);
    this.setState({ games });
    await this.writeToDB();
  }
  
  async updateStakes() {
    const players = cloneDeep(this.state.players);
    for (let i = 0; i < players.length; i++) {
      players[i].balance = this.convertToEther(await this.state.web3.eth.getBalancePromise(players[i].address));
      players[i].stake = this.convertToEther(await this.state.RockPaperScissorsInstance.balances(players[i].address));
    }
    this.setState({ players });
  }

  async followUpTransaction(txHash) {
    console.log("Your transaction is on the way, waiting to be mined!", txHash);
    let receipt = await this.state.web3.eth.getTransactionReceiptMined(txHash);
    // eslint-disable-next-line
    assert.strictEqual(parseInt(receipt.status), 1);
    console.log("Your transaction executed successfully!");
    return true;
  }

  async killContract() {
    let txHash = await this.state.RockPaperScissorsInstance.killContract.sendTransaction({from: this.state.account})
    let success = await this.followUpTransaction(txHash);
    if(success) {
      this.setState({
        status: "Killed"
      })
    }
  }

  async pauseContract() {
    let txHash = await this.state.RockPaperScissorsInstance.pauseContract.sendTransaction({from: this.state.account})
    let success = await this.followUpTransaction(txHash);
    if(success) {
      this.setState({
        status: "Paused"
      })
    }
  }

  async resumeContract() {
    let txHash = await this.state.RockPaperScissorsInstance.resumeContract.sendTransaction({from: this.state.account})
    let success = await this.followUpTransaction(txHash);
    if(success) {
      this.setState({
        status: "Running"
      })
    }
  }

  convertToEther(value) {
    return this.state.web3.fromWei(value.toString(10), "ether");
  }

  convertToWei(value) {
    return this.state.web3.toWei(value, "ether");
  }
  
  render() {
  
    return (
      <div className="App">
        <nav className="navbar pure-menu pure-menu-horizontal">
            <a href="#" className="pure-menu-heading pure-menu-link">Truffle Box</a>
        </nav>

        <main className="container">
          <div className="pure-g">
            <div className="pure-u-1-1">
              <h1>Rock Paper Scissors</h1>
              <p>Contract status is: {this.state.status}</p>
              <button className="changeButton" onClick={ () => this.killContract() }>killContract</button>
              <button className="changeButton" onClick={ () => this.pauseContract() }>pauseContract</button>
              <button className="changeButton" onClick={ () => this.resumeContract() }>resumeContract</button>

            </div>
            <div className="pure-u-1-1">
              <h1>Players:</h1>
              {this.renderPlayer(0)}
              {this.renderPlayer(1)}
              {this.renderPlayer(2)}
            </div>

          </div>
        </main>
      </div>
    );
  }
}

export default App
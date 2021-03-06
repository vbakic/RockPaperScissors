const RockPaperScissors = artifacts.require("RockPaperScissors");

web3.eth.getTransactionReceiptMined = require("../utils/getTransactionReceiptMined.js");
const expectedException = require("../utils/expectedExceptionPromise.js");
const helper = require("../utils/truffleTestHelper"); //to be able to jump blocks into the future

const [Running, Paused, Killed, invalidState] = [0, 1, 2, 10];
const revokePeriod = 5;
const amountWei = 100;
let totalGas = 0;

function checkIfSuccessfulTransaction(tx, caller, expectedEventName) {
    assert.strictEqual(tx.logs.length, 1, "Only one event");
    assert.strictEqual(tx.logs[0].args.caller, caller, "Wrong caller");
    assert.strictEqual(tx.logs[0].event, expectedEventName, "Wrong event");
    if(tx.receipt.gasUsed > 0) {
        totalGas += tx.receipt.gasUsed;
    }
    return assert.equal(tx.receipt.status, 1);
}

function checkChangeOwnerEventArgs(tx, newOwner) {
    return assert.strictEqual(tx.logs[0].args.newOwner, newOwner, "Wrong newOwner");
}

function checkCorrectAmount(tx) {
    return assert.strictEqual(parseInt(tx.logs[0].args.amount.toNumber()), amountWei, "Wrong amount");
}

contract("RockPaperScissors", accounts => {

    const [firstAccount, secondAccount, thirdAccount] = accounts;

    it("should reject deploying contract as killed", async () => {
        await expectedException(() => {
            return RockPaperScissors.new(Killed, revokePeriod, { from: firstAccount })
        });
    });

    describe("testing paused contract", function() {
        let RockPaperScissorsPaused;
        beforeEach(async() => {
            RockPaperScissorsPaused = await RockPaperScissors.new(Paused, revokePeriod, { from: firstAccount });
        });

        it("test resume", async () => {
            let tx = await RockPaperScissorsPaused.resumeContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogResumeContract");
            assert.equal(await RockPaperScissorsPaused.getState(), 0);
        });
    
        it("test kill", async () => {
            let tx = await RockPaperScissorsPaused.killContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogKillContract");
            assert.equal(await RockPaperScissorsPaused.getState(), 2);
        });
    
        it("should reject resume from non-owner", async () => {
            await expectedException(async() => {
                await RockPaperScissorsPaused.resumeContract({ from: secondAccount });
            });
        });
    
        it("should reject kill from non-owner", async () => {
            await expectedException(async() => {
                await RockPaperScissorsPaused.killContract({ from: secondAccount });
            });
        });

    });

    describe("testing running contract", function() {
        let RockPaperScissorsRunning;
        beforeEach(async() => {
            RockPaperScissorsRunning = await RockPaperScissors.new(Running, revokePeriod, { from: firstAccount });
        });
    
        it("test getOwner", async () => {
            assert.equal(await RockPaperScissorsRunning.getOwner(), firstAccount);
        });
    
        it("test getState", async () => {
            assert.equal(await RockPaperScissorsRunning.getState(), 0);
        });
    
        it("test changing owner", async () => {
            let tx = await RockPaperScissorsRunning.changeOwner(secondAccount, { from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogChangeOwner");
            checkChangeOwnerEventArgs(tx, secondAccount);
            assert.equal(await RockPaperScissorsRunning.getOwner(), secondAccount);
        });
    
        it("test pause", async () => {
            let tx = await RockPaperScissorsRunning.pauseContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogPauseContract");
            assert.equal(await RockPaperScissorsRunning.getState(), 1);
        });    

        it("should reject direct transaction without value", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.sendTransaction({ from: firstAccount });
            });
        });
    
        it("should reject direct transaction with value", async() => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.sendTransaction({ from: firstAccount, value: 10 });
            });
        });

        it("should reject change owner from non-owner", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.changeOwner(thirdAccount, { from: secondAccount });
            });
        });
    
        it("should reject pause from non-owner", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.pauseContract({ from: secondAccount });
            });
        });
    
        it("should reject kill if not paused", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.killContract({ from: firstAccount });
            });
        });

        it("test updating period", async () => {
            let newrevokePeriod = 30;
            let tx = await RockPaperScissorsRunning.changeRevokePeriod(newrevokePeriod, { from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogChangeRevokePeriod");
            assert.equal(await RockPaperScissorsRunning.revokePeriodMin(), newrevokePeriod);
        });

        it("should reject withdraw of inexisting funds", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.withdrawEther(amountWei, { from: thirdAccount })
            });
        });

    });

    describe("submit move / revoke move / withdraw funds tests, each starts with player 1 move", function() {
        
        let RockPaperScissorsRunning;
        let gameHash;
        beforeEach(async() => {
            RockPaperScissorsRunning = await RockPaperScissors.new(Running, revokePeriod, { from: firstAccount });
            gameHash = await RockPaperScissorsRunning.encryptMove(2, "pass1", { from: firstAccount });
            let tx = await RockPaperScissorsRunning.startGame(gameHash, amountWei, revokePeriod, { from: firstAccount, value: amountWei })
            checkIfSuccessfulTransaction(tx, firstAccount, "LogStartGame");
            checkCorrectAmount(tx);
            //make sure the player 1 now has amountWei as stake
            let player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(0, player1Stake.toNumber());
        });

        it("should reject double reveal", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);
            let tx2 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx2, secondAccount, "LogRevealMove");
            await expectedException(async() => {
                await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            });
        });

        it("should reject invalid move reveal", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);
            await expectedException(async() => {
                await RockPaperScissorsRunning.revealMove(2, "pass1111", gameHash, { from: firstAccount });
            });
        });

        it("should reject invalid revoke period", async () => {
            let gameHash2 = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            await expectedException(async() => {
                await RockPaperScissorsRunning.startGame(gameHash2, amountWei, revokePeriod-3, { from: secondAccount, value: amountWei });
            });
        });

        it("should reject hash that has been used in the past", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);

            let tx1 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx1, firstAccount, "LogRevealMove");
            let tx2 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx2, secondAccount, "LogRevealMove");

            await expectedException(async() => {
                await RockPaperScissorsRunning.startGame(gameHash, amountWei, revokePeriod, { from: firstAccount, value: amountWei });
            });
        });

        it("should reject if amount to play with is lower than stake", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            await expectedException(async() => {
                await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei/2 });
            });
        });

        it("withdraw test", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);

            let tx1 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx1, firstAccount, "LogRevealMove");
            let tx2 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx2, secondAccount, "LogRevealMove");

            let player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(2*amountWei, player1Stake.toNumber()); //because player 1 won
            let tx = await RockPaperScissorsRunning.withdrawEther(2*amountWei, { from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogWithdrawEther");
            assert.strictEqual(parseInt(tx.logs[0].args.amount.toNumber()), 2*amountWei, "Wrong amount");
        });

        it("should handle the case when player 2 plays with more than necessary", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: 4*amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            assert.strictEqual(parseInt(tx0.logs[0].args.amount.toNumber()), 4*amountWei, "Wrong amount");

            let player2Stake = await RockPaperScissorsRunning.balances(secondAccount, {from: secondAccount});
            assert.strictEqual(3*amountWei, player2Stake.toNumber()); //because contract took only one amountWei from him

            let tx1 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx1, firstAccount, "LogRevealMove");
            let tx2 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx2, secondAccount, "LogRevealMove");

            let player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(2*amountWei, player1Stake.toNumber()); //because player 1 won
            let tx = await RockPaperScissorsRunning.withdrawEther(2*amountWei, { from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogWithdrawEther");
            assert.strictEqual(parseInt(tx.logs[0].args.amount.toNumber()), 2*amountWei, "Wrong amount");

            player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(0, player1Stake.toNumber());
            player2Stake = await RockPaperScissorsRunning.balances(secondAccount, {from: secondAccount});
            assert.strictEqual(3*amountWei, player2Stake.toNumber());
        });

        it("should reset the game if both players make same move, both players should be able to withdraw funds", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(2, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);

            let tx1 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx1, firstAccount, "LogRevealMove");
            let tx3 = await RockPaperScissorsRunning.revealMove(2, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx3, secondAccount, "LogRevealMove");
            
            let player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(amountWei, player1Stake.toNumber());
            let player2Stake = await RockPaperScissorsRunning.balances(secondAccount, {from: secondAccount});
            assert.strictEqual(amountWei, player2Stake.toNumber());
            //both players should be able to withdraw funds now
            let tx = await RockPaperScissorsRunning.withdrawEther(amountWei, { from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogWithdrawEther");
            checkCorrectAmount(tx);
            let tx2 = await RockPaperScissorsRunning.withdrawEther(amountWei, { from: secondAccount });
            checkIfSuccessfulTransaction(tx2, secondAccount, "LogWithdrawEther");
            checkCorrectAmount(tx2);
        });

        it("player should be able to use its contract balance as stake for a game", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);

            let tx3 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx3, firstAccount, "LogRevealMove");
            let tx4 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx4, secondAccount, "LogRevealMove");
            
            //make sure the player 1 now has 2x amountWei
            let player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(2*amountWei, player1Stake.toNumber());
            //now player 1 should be the winner, thus he/she doesn't need to pass any ether when making move            
            let gameHash2 = await RockPaperScissorsRunning.encryptMove(3, "pass3", { from: firstAccount });
            let tx1 = await RockPaperScissorsRunning.startGame(gameHash2, 2*amountWei, revokePeriod, { from: firstAccount });
            checkIfSuccessfulTransaction(tx1, firstAccount, "LogStartGame");
            assert.strictEqual(parseInt(tx1.logs[0].args.amount.toNumber()), 0, "Wrong amount");
            //player 2 will now have to match the stake player 1 has, and that is 2x amountWei
            let hashedMove2 = await RockPaperScissorsRunning.encryptMove(2, "pass4", { from: secondAccount });
            let tx2 = await RockPaperScissorsRunning.joinGame(gameHash2, hashedMove2, { from: secondAccount, value: 2*amountWei });
            checkIfSuccessfulTransaction(tx2, secondAccount, "LogJoinGame");
            assert.strictEqual(parseInt(tx2.logs[0].args.amount.toNumber()), 2*amountWei, "Wrong amount");

            let tx5 = await RockPaperScissorsRunning.revealMove(3, "pass3", gameHash2, { from: firstAccount });
            checkIfSuccessfulTransaction(tx5, firstAccount, "LogRevealMove");
            let tx6 = await RockPaperScissorsRunning.revealMove(2, "pass4", gameHash2, { from: secondAccount });
            checkIfSuccessfulTransaction(tx6, secondAccount, "LogRevealMove");

            //make sure the player 1 now has 4x amountWei
            player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(4*amountWei, player1Stake.toNumber());
            
        });

        it("should support multiple games at a time", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);
            
            let gameHash2 = await RockPaperScissorsRunning.encryptMove(3, "pass3", { from: firstAccount });
            let tx1 = await RockPaperScissorsRunning.startGame(gameHash2, amountWei, revokePeriod, { from: firstAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx1, firstAccount, "LogStartGame");
            checkCorrectAmount(tx1);

            //player 2 will now have to match the stake player 1 has, and that is 2x amountWei
            let hashedMove3 = await RockPaperScissorsRunning.encryptMove(2, "pass4", { from: thirdAccount });
            let tx2 = await RockPaperScissorsRunning.joinGame(gameHash2, hashedMove3, { from: thirdAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx2, thirdAccount, "LogJoinGame");
            checkCorrectAmount(tx2);

            let tx3 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx3, firstAccount, "LogRevealMove");
            let tx4 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx4, secondAccount, "LogRevealMove");


            let tx5 = await RockPaperScissorsRunning.revealMove(3, "pass3", gameHash2, { from: firstAccount });
            checkIfSuccessfulTransaction(tx5, firstAccount, "LogRevealMove");
            let tx6 = await RockPaperScissorsRunning.revealMove(2, "pass4", gameHash2, { from: thirdAccount });
            checkIfSuccessfulTransaction(tx6, thirdAccount, "LogRevealMove");

            //make sure the player 1 now has 4x amountWei
            player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(4*amountWei, player1Stake.toNumber());

        });

        it("should reject withdraw of funds if game is in progress", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.withdrawEther(amountWei, { from: firstAccount });
            });
        });

        it("should reject second move with insufficient funds", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            await expectedException(async() => {
                await RockPaperScissorsRunning.startGame(gameHash, amountWei/2, revokePeriod, { from: secondAccount, value: amountWei/2 });
            });
        });

        it("should reject second move when paused", async () => {
            let tx = await RockPaperScissorsRunning.pauseContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogPauseContract");
            assert.equal(await RockPaperScissorsRunning.getState(), 1);
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            await expectedException(async() => {
                await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei/2 });
            });
        });

        it("should reject reveal if there is no player 2 move yet", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            });
        });

        it("should reject withdraw when paused", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);

            let tx3 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx3, firstAccount, "LogRevealMove");
            let tx4 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx4, secondAccount, "LogRevealMove");

            let tx = await RockPaperScissorsRunning.pauseContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogPauseContract");
            assert.equal(await RockPaperScissorsRunning.getState(), 1);
            await expectedException(async() => {
                await RockPaperScissorsRunning.withdrawEther(amountWei, { from: secondAccount })
            });
        });

        it("should reject withdraw when killed", async () => {
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);
            let tx3 = await RockPaperScissorsRunning.revealMove(2, "pass1", gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx3, firstAccount, "LogRevealMove");
            let tx4 = await RockPaperScissorsRunning.revealMove(1, "pass2", gameHash, { from: secondAccount });
            checkIfSuccessfulTransaction(tx4, secondAccount, "LogRevealMove");
            let tx = await RockPaperScissorsRunning.pauseContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogPauseContract");
            assert.equal(await RockPaperScissorsRunning.getState(), 1);
            let tx2 = await RockPaperScissorsRunning.killContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx2, firstAccount, "LogKillContract");
            assert.equal(await RockPaperScissorsRunning.getState(), 2);
            await expectedException(async() => {
                await RockPaperScissorsRunning.withdrawEther(amountWei, { from: firstAccount })
            });
        });

        it("Pull out from game test", async () => {
            for(var i=0; i < revokePeriod; i++) {
                await helper.advanceBlock();
            }
            //make sure the player 1 has 0 amountWei
            let player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(0, player1Stake.toNumber());
            let tx = await RockPaperScissorsRunning.pullOutFromGame(gameHash, { from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogPullOutFromGame");
            //make sure the player 1 has 0 amountWei
            player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(amountWei, player1Stake.toNumber());
        });

        it("should fail pull out from game", async () => {
            await expectedException(async() => {
                await RockPaperScissorsRunning.pullOutFromGame(gameHash, { from: firstAccount });
            });
        });

        it("should fail pull out from game #2", async () => {
            for(var i=0; i < revokePeriod; i++) {
                await helper.advanceBlock();
            }
            //make sure the player 1 has 0 amountWei
            let player1Stake = await RockPaperScissorsRunning.balances(firstAccount, {from: firstAccount});
            assert.strictEqual(0, player1Stake.toNumber());
            
            let moveHash = await RockPaperScissorsRunning.encryptMove(1, "pass2", { from: secondAccount });
            let tx0 = await RockPaperScissorsRunning.joinGame(gameHash, moveHash, { from: secondAccount, value: amountWei });
            checkIfSuccessfulTransaction(tx0, secondAccount, "LogJoinGame");
            checkCorrectAmount(tx0);

            await expectedException(async() => { //too late to pull out now
                await RockPaperScissorsRunning.pullOutFromGame(gameHash, { from: firstAccount });
            });
        });

        it("should reject revoke when paused", async () => {
            for(var i=0; i < revokePeriod; i++) {
                await helper.advanceBlock();
            }
            let tx = await RockPaperScissorsRunning.pauseContract({ from: firstAccount });
            checkIfSuccessfulTransaction(tx, firstAccount, "LogPauseContract");
            assert.equal(await RockPaperScissorsRunning.getState(), 1);
            await expectedException(async() => {
                await RockPaperScissorsRunning.pullOutFromGame(gameHash, { from: firstAccount });
            });
        });
    
    });

    describe("testing killed contract", function() {
        let RockPaperScissorsKilled;
        beforeEach( async () => {
            //setting initial state to paused because it can't be started as killed
            RockPaperScissorsKilled = await RockPaperScissors.new(Paused, revokePeriod, { from: firstAccount })
            await RockPaperScissorsKilled.killContract({from: firstAccount}); //killing the contract
        });
    
        it("should reject resume if killed", async () => {
            await expectedException(async() => {
                await RockPaperScissorsKilled.resumeContract({ from: firstAccount });
            });
        });
    
        it("should reject pause if killed", async () => {
            await expectedException(async() => {
                await RockPaperScissorsKilled.pauseContract({ from: firstAccount });
            });
        });

        it("should reject submit move when killed", async () => {
            let moveHash = await RockPaperScissorsKilled.encryptMove(2, "pass1", { from: firstAccount });
            await expectedException(async() => {
                await RockPaperScissorsKilled.startGame(moveHash, amountWei, revokePeriod, { from: firstAccount, value: amountWei })
            });
        });
    
    });

    describe("testing constructor parameters", function() {

        it("should reject if invalid state provided", async () => {            
            await expectedException(async() => {
                await RockPaperScissors.new(invalidState, revokePeriod, { from: firstAccount })
            });
        });
    
    });

    describe("output total gas", function() {
        it("should output total gas", async () => {
            console.log(parseInt(totalGas/1000));
        });
    });

});



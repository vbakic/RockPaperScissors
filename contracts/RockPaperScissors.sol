pragma solidity 0.4.25;

import "./SafeMath.sol";
import "./Pausable.sol";

contract RockPaperScissors is Pausable {
    
    using SafeMath for uint;
    
    event LogWithdrawEther(address indexed caller, uint amount);
    event LogChangeRevokePeriod(address indexed caller, uint newrevokePeriod);
    event LogPullOutFromGame(address indexed caller, bytes32 gameHash);
    event LogStartGame(address indexed caller, uint amount, uint amountToPlayWith, bytes32 gameHash, uint revokePeriod);
    event LogJoinGame(address indexed caller, uint amount, bytes32 gameHash);
    event LogRevealMove(address indexed caller, uint8 move, bytes32 plainPassword, bytes32 gameHash);
    
    enum PossibleMoves { NotPlayedYet, Rock, Paper, Scissors }
    
    uint public revokePeriodMin;
    uint public revokeAfter;
    
    struct Game {
        PossibleMoves move1;
        PossibleMoves move2;
        uint stake;
        address player1;
        address player2;
        uint revokeAfter;
        bytes32 Player2Hash;
    }
    
    mapping (address => uint) public balances;
    mapping (bytes32 => Game) public games;
    //each game can be accessed via unique key, which is hash derived from the inputs that game creator provided
    
    constructor(uint8 initialState, uint defaultrevokePeriod) public Pausable(initialState) {
        changeRevokePeriod(defaultrevokePeriod);
    }
    
    function encryptMove(uint8 move, bytes32 plainPassword) public view returns (bytes32) {
        require(move >= 1 && move <= 3, "Error: you need to submit a valid move");
        require(plainPassword != "", "Error: you need to submit a valid password");
        return keccak256(abi.encodePacked(move, plainPassword, msg.sender, address(this)));
    }
    
    function changeRevokePeriod(uint newrevokePeriod) 
            public onlyOwner onlyIfAlive returns(bool success) {
        require(newrevokePeriod != 0, "Error: revokePeriod not provided / cannot be zero");
        emit LogChangeRevokePeriod(msg.sender, newrevokePeriod);
        revokePeriodMin = newrevokePeriod;
        return true;
    }

    function withdrawEther(uint amount) public onlyIfRunning payable returns(bool) {
        require(amount != 0, "Error: amount cannot be zero");
        uint balance = balances[msg.sender];
        require(amount <= balance, "Error: you asked for nonexisting funds");
        emit LogWithdrawEther(msg.sender, amount);
        balances[msg.sender] = balances[msg.sender].sub(amount);
        msg.sender.transfer(amount);
        return true;
    }
    
    function pullOutFromGame(bytes32 gameHash) public onlyIfAlive onlyIfRunning returns (bool success) {
        require(games[gameHash].player1 == msg.sender, "Error: not your game");
        require(games[gameHash].player2 == address(0), "Error: you are not the only player");
        require(block.number >= games[gameHash].revokeAfter, "Error: you are not yet permitted to pull out from game");
        emit LogPullOutFromGame(msg.sender, gameHash);
        balances[msg.sender] = balances[msg.sender].add(games[gameHash].stake); //give back the stake
        return true;
    }

    function startGame(bytes32 gameHash, uint amountToPlayWith, uint revokePeriod) 
        public onlyIfAlive onlyIfRunning payable returns(bool success) {
                
        require(games[gameHash].player1 == address(0), "Error: you cannot create this game");
        require(revokePeriod >= revokePeriodMin, "Error: revoke period too low");
        require(amountToPlayWith > 0, "Error");

        uint senderBalance = balances[msg.sender];
        uint PlayerStake = amountToPlayWith;
        if(msg.value > 0) {
            senderBalance = senderBalance.add(msg.value);
        }
        require(senderBalance >= PlayerStake, "Error: you do not have enough funds");

        emit LogStartGame(msg.sender, msg.value, amountToPlayWith, gameHash, revokePeriod);

        balances[msg.sender] = senderBalance.sub(PlayerStake);
        games[gameHash].player1 = msg.sender;
        games[gameHash].stake = PlayerStake;
        games[gameHash].revokeAfter = block.number.add(revokePeriod);

        return true;        
    }

    function joinGame(bytes32 gameHash, bytes32 moveHash) 
        public onlyIfAlive onlyIfRunning payable returns(bool success) {

        require(games[gameHash].player1 != address(0), "Error: the game does not exist");
        require(games[gameHash].player2 == address(0), "Error: you cannot join this game");
        
        uint senderBalance = balances[msg.sender];
        if(msg.value > 0) {
            senderBalance = senderBalance.add(msg.value);
        }

        uint gameStake = games[gameHash].stake;
        require(senderBalance >= gameStake, "Error: you do not have enough funds");

        emit LogJoinGame(msg.sender, msg.value, gameHash);

        balances[msg.sender] = senderBalance.sub(gameStake);
        games[gameHash].player2 = msg.sender;
        games[gameHash].Player2Hash = moveHash;

        return true;        
    }

    function revealMove(uint8 move, bytes32 plainPassword, bytes32 gameHash) public returns (bool) {

        if(games[gameHash].player1 == msg.sender) {
            require(games[gameHash].player2 != address(0), "Error: prevent reveal if there is no other player yet");
            require(games[gameHash].move1 == PossibleMoves.NotPlayedYet, "Error: move already revealed!");
            bytes32 gameHashReconstructed = encryptMove(move, plainPassword);
            require(gameHashReconstructed == gameHash, "Error: hashes not matching");
            games[gameHash].move1 = PossibleMoves(move);
        } else if(games[gameHash].player2 == msg.sender) {
            //this time we won't check if there is another player, since it has to be
            require(games[gameHash].move2 == PossibleMoves.NotPlayedYet, "Error: move already revealed!");
            bytes32 moveHashReconstructed = encryptMove(move, plainPassword);
            require(moveHashReconstructed == games[gameHash].Player2Hash, "Error: hashes not matching");
            games[gameHash].move2 = PossibleMoves(move);
        } else {
            assert(false);
        }

        emit LogRevealMove(msg.sender, move, plainPassword, gameHash);

        endOrResetGame(gameHash);

        return true;
    }

    function endOrResetGame(bytes32 gameHash) internal returns (bool) {
        
        if(games[gameHash].move1 == PossibleMoves.NotPlayedYet) return false;
        if(games[gameHash].move2 == PossibleMoves.NotPlayedYet) return false;
        if(games[gameHash].stake == 0) return false;

        if(games[gameHash].move1 == games[gameHash].move2) {
            resetGame(gameHash);
        } else {
            endGame(gameHash);
        }

        games[gameHash].stake = 0;

        return true;
    }
    
    function endGame(bytes32 gameHash) internal {
        address player1 = games[gameHash].player1;
        address player2 = games[gameHash].player2;
        uint stake = games[gameHash].stake;
        uint winner = chooseWinner(gameHash);
        if(winner == 1) {
            balances[player1] = balances[player1].add(2*stake);
        } else if(winner == 2) {
            balances[player2] = balances[player2].add(2*stake);
        } else {
            assert(false);
        }
    }
    
    function resetGame(bytes32 gameHash) internal {
        balances[games[gameHash].player1] = balances[games[gameHash].player1].add(games[gameHash].stake);
        balances[games[gameHash].player2] = balances[games[gameHash].player2].add(games[gameHash].stake);
    }
    
    function chooseWinner(bytes32 gameHash) internal view returns (uint) {

        PossibleMoves player1move = games[gameHash].move1;
        PossibleMoves player2move = games[gameHash].move2;

        if(player1move == PossibleMoves.Rock) {
            if(player2move == PossibleMoves.Paper) {
                return 2;
            }
            if(player2move == PossibleMoves.Scissors) {
                return 1;
            }
        }
        
        if(player1move == PossibleMoves.Paper) {
            if(player2move == PossibleMoves.Rock) {
                return 1;
            }
            if(player2move == PossibleMoves.Scissors) {
                return 2;
            }
        }
        
        if(player1move == PossibleMoves.Scissors) {
            if(player2move == PossibleMoves.Rock) {
                return 2;
            }
            if(player2move == PossibleMoves.Paper) {
                return 1;
            }
        }

        assert(false);
        
    }
    
}
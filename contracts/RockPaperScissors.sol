pragma solidity 0.4.24;

import "./SafeMath.sol";
import "./Pausable.sol";

contract RockPaperScissors is Pausable {
    
    using SafeMath for uint;
    
    event LogWithdrawEther(address indexed caller, uint amount);
    event LogChangeRevokePeriod(address indexed caller, uint newrevokePeriod);
    event LogPullOutFromGame(address indexed caller);
    event LogSubmitMove(address indexed caller, uint amount);
    event LogRevealMove(address indexed caller, uint8 move, bytes32 plainPassword);
    event LogEndGame(address indexed caller, address indexed player1, address indexed player2);
    event LogResetGame(address indexed caller, address indexed player1, address indexed player2);
    
    enum PossibleMoves { NotPlayedYet, Rock, Paper, Scissors }
    
    uint public revokePeriod;
    uint public revokeAfter;
    
    uint public stake;
    address public player1;
    address public player2;
    bytes32 public p1HashedMove;
    bytes32 public p2HashedMove;
    PossibleMoves player1move;
    PossibleMoves player2move;
    
    mapping (bytes32 => bool) public usedHashes;
    mapping (address => uint) public balances;
    
    constructor(uint8 initialState, uint defaultrevokePeriod) public Pausable(initialState) {
        changeRevokePeriod(defaultrevokePeriod);
    }
    
    function encryptMove(uint8 move, bytes32 plainPassword) public view returns (bytes32) {
        require(move >= 1 && move <= 3, "Error: you need to submit a valid move");
        require(plainPassword != "", "Error: you need to submit a valid password");
        return keccak256(abi.encodePacked(move, plainPassword, msg.sender, address(this)));
    }
    
    function decryptMove(uint8 move, bytes32 plainPassword) internal {
        require(player2 != address(0), "Error: player2 hasn't played yet!");
        bytes32 decryptedMove = keccak256(abi.encodePacked(move, plainPassword, msg.sender, address(this)));
        if(msg.sender == player1) {
            require(decryptedMove == p1HashedMove, "Error: that is not the move you played!");
            player1move = PossibleMoves(move);
        } else if(msg.sender == player2) {
            require(decryptedMove == p2HashedMove, "Error: that is not the move you played!");
            player2move = PossibleMoves(move);
        }
    }
    
    function changeRevokePeriod(uint newrevokePeriod) 
            public onlyOwner onlyIfAlive returns(bool success) {
        require(newrevokePeriod != 0, "Error: revokePeriod not provided / cannot be zero");
        emit LogChangeRevokePeriod(msg.sender, newrevokePeriod);
        revokePeriod = newrevokePeriod;
        return true;
    }

    function withdrawEther(uint amount) public onlyIfRunning payable returns(bool) {
        require(msg.sender != player1 && msg.sender != player2, "Error: you cannot withdraw any funds while game is in progress");
        require(amount != 0, "Error: amount cannot be zero");
        uint balance = balances[msg.sender];
        require(amount <= balance, "Error: you asked for nonexisting funds");
        emit LogWithdrawEther(msg.sender, amount);
        balances[msg.sender] = balances[msg.sender].sub(amount);
        msg.sender.transfer(amount);
        return true;
    }
    
    function pullOutFromGame() public onlyIfAlive onlyIfRunning returns (bool success) {
        require(msg.sender == player1, "Error: only player1 can pull out from game");
        require(block.number >= revokeAfter && revokeAfter != 0, "Error: you are not yet permitted to pull out from game");
        resetGame();
        emit LogPullOutFromGame(msg.sender);
        return true;
    }
    
    function submitMove(bytes32 hashedMove, uint amountToPlayWith) public onlyIfAlive onlyIfRunning payable returns(bool) {
        
        require(player1 != msg.sender, "Error: player 2 cannot be the same as player 1");
        require(usedHashes[hashedMove] == false, "Error: you cannot use same hash twice");
        
        if(msg.value > 0) {
            balances[msg.sender] = balances[msg.sender].add(msg.value);
        }

        require(balances[msg.sender] >= amountToPlayWith, "Error: player needs to have enough funds to play");
        require(balances[msg.sender] >= stake, "Error: player needs to have enough funds to play");
        require(amountToPlayWith >= stake, "Error: player needs to have enough funds to play");
        
        emit LogSubmitMove(msg.sender, msg.value);
        
        if(player1 == address(0)) {
            player1 = msg.sender;
            p1HashedMove = hashedMove;
            stake = amountToPlayWith;
            revokeAfter = block.number.add(revokePeriod);
        } else if (player2 == address(0)) {
            player2 = msg.sender;
            p2HashedMove = hashedMove;
        }

        usedHashes[hashedMove] = true;

        return true;
        
    }

    function revealMove(uint8 move, bytes32 plainPassword) public returns (bool) {
        decryptMove(move, plainPassword);
        emit LogRevealMove(msg.sender, move, plainPassword);
        //now, if both players have revealed their moves, proceeed with either resetting the game or choosing the winner
        if(player1move != PossibleMoves.NotPlayedYet && player2move != PossibleMoves.NotPlayedYet) {
            if(player1move == player2move) {
                resetGame();
            } else {
                endGame();
            }
        }
        return true;
    }
    
    function endGame() internal {
        //just additional check
        require(player1move != PossibleMoves.NotPlayedYet, "Error: player1 move not revealed");
        require(player2move != PossibleMoves.NotPlayedYet, "Error: player2 move not revealed");
        emit LogEndGame(msg.sender, player1, player2);
        uint winner = chooseWinner();
        if(winner == 1) {
            require(balances[player2] >= stake, "Error: not enough funds for player 2");
            balances[player1] = balances[player1].add(stake);
            balances[player2] = balances[player2].sub(stake);
        } else if(winner == 2) {
            require(balances[player1] >= stake, "Error: not enough funds for player 1");
            balances[player2] = balances[player2].add(stake);
            balances[player1] = balances[player1].sub(stake);
        }
        resetGame();
    }
    
    function resetGame() internal {
        emit LogResetGame(msg.sender, player1, player2);
        player1 = address(0);
        player2 = address(0);
        revokeAfter = 0;
        stake = 0;
        player1move = PossibleMoves.NotPlayedYet;
        player2move = PossibleMoves.NotPlayedYet;
    }
    
    function chooseWinner() internal view returns (uint) {
                
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
        
    }
    
}
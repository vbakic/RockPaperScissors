pragma solidity 0.4.24;

import "./SafeMath.sol";
import "./Pausable.sol";

contract RockPaperScissors is Pausable {
    
    using SafeMath for uint;
    
    event LogWithdrawEther(address indexed caller, uint amount);
    event LogChangeRevokePeriod(address indexed caller, uint newrevokePeriod);
    event LogPullOutFromGame(address indexed caller);
    event LogSubmitMove(address indexed caller, uint amount);
    
    enum PossibleMoves { NotPlayedYet, Rock, Paper, Scissors }
    
    uint public revokePeriod;
    uint public revokeAfter;
    
    uint public stake;
    address public player1;
    address public player2;
    bytes32 public p1HashedMove;
    bytes32 public p2HashedMove;
    
    mapping (address => uint) public balances;
    
    constructor(uint8 initialState, uint defaultrevokePeriod) public Pausable(initialState) {
        changeRevokePeriod(defaultrevokePeriod);
    }
    
    function encryptMove(uint8 move) public view returns (bytes32) {
        require(move != 0, "Error: you need to submit a valid move");
        return keccak256(abi.encodePacked(move, msg.sender, address(this)));
    }
    
    function decryptMove(address player, bytes32 moveHash) public view returns (PossibleMoves) {
        bytes32 decryptedMove;
        decryptedMove = keccak256(abi.encodePacked(PossibleMoves.Rock, player, address(this)));
        if(decryptedMove == moveHash) {
            return PossibleMoves.Rock;
        }
        decryptedMove = keccak256(abi.encodePacked(PossibleMoves.Paper, player, address(this)));
        if(decryptedMove == moveHash) {
            return PossibleMoves.Paper;
        }
        decryptedMove = keccak256(abi.encodePacked(PossibleMoves.Scissors, player, address(this)));
        if(decryptedMove == moveHash) {
            return PossibleMoves.Scissors;
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
    
    function submitMove(bytes32 hashedMove) public onlyIfAlive onlyIfRunning payable returns(bool) {
        
        require(player1 != msg.sender, "Error: player 2 cannot be the same as player 1");
        
        if(msg.value > 0) {
            balances[msg.sender] = balances[msg.sender].add(msg.value);
        }
        
        require(balances[msg.sender] >= stake, "Error: player needs to have enough funds to play");
        
        emit LogSubmitMove(msg.sender, msg.value);

        if(decryptMove(player1, p1HashedMove) == decryptMove(msg.sender, hashedMove)) {
            resetGame();
            return true;
        }
        
        if(player1 == address(0)) {
            player1 = msg.sender;
            p1HashedMove = hashedMove;
            stake = balances[msg.sender];
            revokeAfter = block.number.add(revokePeriod);
        } else if (player2 == address(0)) {
            player2 = msg.sender;
            p2HashedMove = hashedMove;
            endGame();
        }
        return true;
        
    }
    
    function endGame() internal {
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
        player1 = address(0);
        player2 = address(0);
        revokeAfter = 0;
        stake = 0;
    }
    
    function chooseWinner() internal view returns (uint) {
        
        PossibleMoves player1move = decryptMove(player1, p1HashedMove);
        PossibleMoves player2move = decryptMove(player2, p2HashedMove);
        
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
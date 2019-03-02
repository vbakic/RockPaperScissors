pragma solidity 0.4.24;

import "./SafeMath.sol";
import "./Pausable.sol";

contract RockPaperScissors is Pausable {
    
    using SafeMath for uint;
    
    event LogWithdrawEther(address indexed caller, uint amount);
    event LogChangeRevokePeriod(address indexed caller, uint newrevokePeriod);
    event LogPullOutFromGame(address indexed caller);
    event LogSubmitMove(address indexed caller, uint amount, uint amountToPlayWith, bytes32 hashedMove, uint revokePeriod);
    event LogRevealMove(address indexed caller, uint8 move, bytes32 plainPassword);
    
    enum PossibleMoves { NotPlayedYet, Rock, Paper, Scissors }
    
    uint public revokePeriodMin;
    uint public revokeAfter;
    
    struct Move {
        PossibleMoves move;
        uint stake;
        address player;
        uint revokeAfter;
    }
    
    mapping (address => uint) public balances;
    mapping (bytes32 => Move) public moves;
    bytes32[] public movesList;
    
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
    
    function pullOutFromGame() public onlyIfAlive onlyIfRunning returns (bool success) {
        require(movesList.length % 2 == 1, "Error: you are not the only player anymore");
        bytes32 lastMoveHash = movesList[movesList.length - 1];
        require(msg.sender == moves[lastMoveHash].player, "Error: you are not the last player");
        require(block.number >= moves[lastMoveHash].revokeAfter, "Error: you are not yet permitted to pull out from game");
        emit LogPullOutFromGame(msg.sender);
        balances[msg.sender] = balances[msg.sender].add(moves[lastMoveHash].stake); //give back the stake
        bytes32 terminator;
        movesList.push(terminator); //"terminates" the current game
        return true;
    }

    function submitMove(bytes32 hashedMove, uint amountToPlayWith, uint revokePeriod) 
        public onlyIfAlive onlyIfRunning payable returns(bool success) {
                
        require(moves[hashedMove].player == address(0), "Error: you cannot use same hash twice");
        require(revokePeriod >= revokePeriodMin, "Error: revoke period too low");
        require(amountToPlayWith > 0, "Error");

        uint senderBalance = balances[msg.sender];
        uint PlayerStake = amountToPlayWith;
        if(msg.value > 0) {
            senderBalance = senderBalance.add(msg.value);
        }
        require(senderBalance >= PlayerStake, "Error: you do not have enough funds");

        emit LogSubmitMove(msg.sender, msg.value, amountToPlayWith, hashedMove, revokePeriod);

        if(movesList.length % 2 == 1) { //this should be the case of player 2, if player 1 already made the move
            bytes32 lastElementHash = movesList[movesList.length-1];
            if(amountToPlayWith > moves[lastElementHash].stake) { //in case player 2 meant to play with more than player 1 stake
                PlayerStake = moves[lastElementHash].stake; //match it with player 1 stake
            } else if(amountToPlayWith == moves[lastElementHash].stake) {
                //do nothing, we're fine
            } else {
                assert(false);
            }
        } else {
            moves[hashedMove].revokeAfter = block.number.add(revokePeriod); //we only need it for player1
        }

        balances[msg.sender] = senderBalance.sub(PlayerStake);
        moves[hashedMove].player = msg.sender;
        moves[hashedMove].stake = PlayerStake;
        movesList.push(hashedMove);

        return true;        
    }

    function revealMove(uint8 move, bytes32 plainPassword) public returns (bool) {

        bytes32 moveHash = encryptMove(move, plainPassword);
        require(moves[moveHash].player == msg.sender, "Error: not your move!");
        require(moves[moveHash].move == PossibleMoves.NotPlayedYet, "Error: move already revealed!");

        if(movesList.length % 2 == 1 && moves[movesList[movesList.length-1]].player == msg.sender) {
            assert(false); //in case there is no player 2 move yet
        }

        moves[moveHash].move = PossibleMoves(move);
                
        emit LogRevealMove(msg.sender, move, plainPassword);

        endOrResetGame(findOtherPlayer(moveHash), moveHash);

        return true;
    }

    function findOtherPlayer(bytes32 moveHash) internal view returns (bytes32) {
        for(uint i = 0; i < movesList.length; i++) {
            if(movesList[i] == moveHash) {
                if(i % 2 == 0) {
                    return movesList[i+1];
                } else {
                    return movesList[i-1];
                }
            }
        }
        assert(false);
    }

    function endOrResetGame(bytes32 moveHashP1, bytes32 moveHashP2) internal returns (bool) {
        
        if(moves[moveHashP1].move == PossibleMoves.NotPlayedYet) return false;
        if(moves[moveHashP2].move == PossibleMoves.NotPlayedYet) return false;
        if(moves[moveHashP1].stake == 0) return false;
        if(moves[moveHashP2].stake == 0) return false;

        if(moves[moveHashP1].move == moves[moveHashP2].move) {
            resetGame(moveHashP1, moveHashP2);
        } else {
            endGame(moveHashP1, moveHashP2);
        }

        moves[moveHashP1].stake = 0;
        moves[moveHashP2].stake = 0;

        return true;
    }
    
    function endGame(bytes32 moveHashP1, bytes32 moveHashP2) internal {
        address player1 = moves[moveHashP1].player;
        address player2 = moves[moveHashP2].player;
        uint stake = moves[moveHashP1].stake;
        uint winner = chooseWinner(moveHashP1, moveHashP2);
        if(winner == 1) {
            balances[player1] = balances[player1].add(2*stake);
        } else if(winner == 2) {
            balances[player2] = balances[player2].add(2*stake);
        } else {
            assert(false);
        }
    }
    
    function resetGame(bytes32 moveHashP1, bytes32 moveHashP2) internal {
        balances[moves[moveHashP1].player] = balances[moves[moveHashP1].player].add(moves[moveHashP1].stake);
        balances[moves[moveHashP2].player] = balances[moves[moveHashP2].player].add(moves[moveHashP2].stake);
    }
    
    function chooseWinner(bytes32 moveHashP1, bytes32 moveHashP2) internal view returns (uint) {

        PossibleMoves player1move = moves[moveHashP1].move;
        PossibleMoves player2move = moves[moveHashP2].move;

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
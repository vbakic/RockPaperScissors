pragma solidity 0.4.24;

import "./Owned.sol";

contract Pausable is Owned {

    enum PossibleStates { Running, Paused, Killed }
    PossibleStates private state;

    event LogPauseContract(address indexed caller);
    event LogResumeContract(address indexed caller);
    event LogKillContract(address indexed caller);

    modifier onlyIfRunning {
        require(state == PossibleStates.Running, "Error: contract paused or killed");
        _;
    }

    modifier onlyIfAlive {
        require(state != PossibleStates.Killed, "Error: contract killed");
        _;
    }

    modifier onlyIfPaused {
        require(state == PossibleStates.Paused, "Error: contract not paused");
        _;
    }

    constructor(uint8 initialState) public {
        require(PossibleStates(initialState) != PossibleStates.Killed, "Error: contract cannot be killed at instantiation");
        state = PossibleStates(initialState);
    }

    function getState() public view returns (uint8) {
        return uint8(state);
    }

    function pauseContract() public onlyIfRunning onlyOwner returns(bool) {
        emit LogPauseContract(msg.sender);
        state = PossibleStates.Paused;
        return true;
    }

    function resumeContract() public onlyOwner onlyIfPaused returns(bool) {
        emit LogResumeContract(msg.sender);
        state = PossibleStates.Running;
        return true;
    }

    function killContract() public onlyOwner onlyIfPaused returns (bool) {
        emit LogKillContract(msg.sender);
        state = PossibleStates.Killed;
        return true;
    }

}
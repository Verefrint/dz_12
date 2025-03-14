// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

error NotEnoughToPlay();
error NotAvailableNow();
error NotPlayerOrPlayed();
error NotYourHash();
error NotRevealed();
error SenderIsPlayerYet();
error UnsuccessedWithdraw();

contract Game {

    enum Step {
        scisors,
        stone,
        paper
    }

    enum UserStep {
        notGamer,
        register, 
        commit,
        reveal
    }

    enum GameStep {
        gameNotStarted,
        firstPlayerRegistered,
        secondPlayerRegistered,
        firstPlayerCommited,
        secondPlayerCommited,
        firstPlayerRevealed,
        secondPlayerRevealed
    }

    struct GameStorage {
        address first;
        Step firstStep; 
        address second; 
        Step secondStep;
    }

    event RegistrationEvent(address player);
    event StepEvent(address player);
    event WienerEvent(address first, Step firstStep, address second, Step secondStep);
    event FinishGameUnsuccesfully(address indexed winer, string reason);

    uint public startTime;
    uint public toPlay;
    GameStep public index;
    address public firstCommited;

    mapping(address => bytes32) public steps;
    mapping(address => UserStep) public players;

    GameStorage private game;

    constructor (uint _amountToPlay) {
        toPlay = _amountToPlay;
    }

    //for test
    function getIndex() public view returns(GameStep) {
        return index;
    }

    function getSteps(address player) public view returns(bytes32) {
        return steps[player];
    }

    function getPayments(address player) public view returns(uint) {
        return uint(players[player]);
    }

    function registration() public payable {
        require(msg.value == toPlay, NotEnoughToPlay());
        require(uint(index) < 2, NotAvailableNow());
        require(players[msg.sender] == UserStep.notGamer, SenderIsPlayerYet());

        index = GameStep(uint(index) + 1);

        players[msg.sender] = UserStep.register;

        emit RegistrationEvent(msg.sender);
    }

    //for test
    function countMinutes() public view returns(uint) {
        return (block.timestamp - startTime) / 60;
    } 

    function commit(bytes32 step) external  {
        if (countMinutes() >= 5 && uint(index) == 3) {
            //revert
            (bool success, ) = payable(firstCommited).call{value: address(this).balance}("");
            require(success, UnsuccessedWithdraw());
            emit FinishGameUnsuccesfully(firstCommited, "The second user doesn't be on time");

            clearGame();
        } else {
            require(uint(index) < 4, NotAvailableNow());
            require(players[msg.sender] == UserStep.register, NotPlayerOrPlayed());

            if (startTime == 0) {
                startTime = block.timestamp;
            }
            
            steps[msg.sender] = step;
            players[msg.sender] = UserStep.commit;
            firstCommited = msg.sender;

            index = GameStep(uint(index) + 1);

            emit StepEvent(msg.sender);
        }
    }

    function reveal(Step step, bytes32 secret) external  {
        if (countMinutes() >= 5 && uint(index) == 5) {
            //revert
            (bool success, ) = payable(firstCommited).call{value: address(this).balance}("");
            require(success, UnsuccessedWithdraw());
            emit FinishGameUnsuccesfully(firstCommited, "The second user doesn't be on time");

            clearGame();
        }

        require(uint(index) < 6, NotAvailableNow());
        require(players[msg.sender] == UserStep.commit, NotPlayerOrPlayed());

        bytes32 originate = keccak256(abi.encodePacked(step, secret));
        require(originate == steps[msg.sender], NotYourHash());

        firstCommited = msg.sender;

        index = GameStep(uint(index) + 1);

        if (game.first == address(0)) {
            game.first = msg.sender;
            game.firstStep = step;
        } else {
            game.second = msg.sender;
            game.secondStep = step;

            setWinner();
            clearGame();
        }
    }

    function clearGame() private {
        startTime = 0;
        index = GameStep.gameNotStarted;
        firstCommited = address(0);

        delete players[game.first];
        delete players[game.second];
        delete steps[game.first];
        delete steps[game.second];

        game.first = address(0);
        game.second = address(0);
    }

    function setWinner() private {
        require(game.first != address(0) && game.second != address(0), NotRevealed());

        if (game.firstStep == game.secondStep) {
            game.first.call{value: toPlay}("");
            game.second.call{value: toPlay}("");
        } else {
            if ((game.firstStep == Step.scisors && game.secondStep == Step.paper) ||
                (game.firstStep == Step.stone && game.secondStep == Step.scisors) ||
                (game.firstStep == Step.paper && game.secondStep == Step.stone)) {
                game.first.call{value: address(this).balance}("");
            } else {
                game.second.call{value: address(this).balance}("");
            }
        }

        emit WienerEvent(game.first, game.firstStep, game.second, game.secondStep);
    }
}
import { bigint } from 'hardhat/internal/core/params/argumentTypes.js';
import { loadFixture, ethers, expect, network } from './setup.ts';

describe("Game test", async function() {

    async function deploy() {
        const [owner, user1, user2] = await ethers.getSigners()

        const factory = await ethers.getContractFactory("Game", owner)
        const contract = await factory.deploy(1_000_000)

        await contract.waitForDeployment()

        return {user1, user2, contract}
    }

    it("should registrate success, should emit RegistrationEvent", async function() {
        const {user1, user2, contract} = await loadFixture(deploy)

        const gameCost = 1_000_000;

        await contract.connect(user1).registration({value: gameCost})

        //catch error try to register again
        await expect(contract.connect(user1).registration({value: gameCost})).to.be.revertedWithCustomError(contract, "SenderIsPlayerYet")

        expect(await contract.getIndex()).to.equal(1)
        expect(await contract.getPayments(await user1.getAddress())).to.equal(1)

        await expect(contract.connect(user2).registration({value: gameCost})).to.emit(contract, "RegistrationEvent").withArgs(await user2.getAddress())
        
        expect(await contract.getIndex()).to.equal(2)
        expect(await contract.getPayments(await user1.getAddress())).to.equal(1)
        expect(await contract.getPayments(await user2.getAddress())).to.equal(1)

        expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(gameCost * 2)

        //check errors 
        await expect(contract.connect(user1).registration({value: gameCost - 1})).to.be.revertedWithCustomError(contract, "NotEnoughToPlay")
        await expect(contract.connect(user1).registration({value: gameCost})).to.be.revertedWithCustomError(contract, "NotAvailableNow")
    })

    it("should commit succesfully", async function() {
        const {user1, user2, contract} = await loadFixture(deploy)

        const gameCost = 1_000_000;
        await contract.connect(user1).registration({value: gameCost})
        await contract.connect(user2).registration({value: gameCost})


        await expect(await contract.connect(user1).startTime()).to.equal(0)

        const commitMessageUser1 = ethers.solidityPackedKeccak256(["uint256", "string"], [1, "secret"])
        const commitMessageUser2 = ethers.solidityPackedKeccak256(["uint256", "string"], [0, "secr"])

        await expect(contract.connect(user1).commit(commitMessageUser1)).to.emit(contract, "StepEvent").withArgs(await user1.getAddress())

        const stTime = (await ethers.provider.getBlock("latest"))?.timestamp

        await expect(await contract.connect(user1).startTime()).to.equal(stTime)
        await expect(await contract.connect(user1).getIndex()).to.equal(3)
        expect(await contract.getPayments(await user1.getAddress())).to.equal(2)

        //catch error
        await expect(contract.connect(user1).commit(commitMessageUser1)).to.be.revertedWithCustomError(contract, "NotPlayerOrPlayed")

        await expect(contract.connect(user2).commit(commitMessageUser2)).to.emit(contract, "StepEvent").withArgs(await user2.getAddress())
        
        await expect(await contract.connect(user1).startTime()).to.equal(stTime)
        await expect(await contract.connect(user1).getIndex()).to.equal(4)
        expect(await contract.getPayments(await user2.getAddress())).to.equal(2)

        //catch error
        await expect(contract.connect(user1).commit(commitMessageUser1)).to.be.revertedWithCustomError(contract, "NotAvailableNow")
    })

    it("should deny game and withdraw all money to firstPlayer", async function() {
        const {user1, user2, contract} = await loadFixture(deploy)

        const gameCost = 1_000_000;
        await contract.connect(user1).registration({value: gameCost})
        await contract.connect(user2).registration({value: gameCost})

        const commitMessageUser1 = ethers.solidityPackedKeccak256(["uint256", "string"], [1, "secret"])
        const commitMessageUser2 = ethers.solidityPackedKeccak256(["uint256", "string"], [0, "secr"])

        await expect(contract.connect(user1).commit(commitMessageUser1)).to.emit(contract, "StepEvent").withArgs(await user1.getAddress())

        await contract.connect(user1).startTime()

        const newTimestamp = (Number(await contract.connect(user1).startTime()) + (60 * 5)); // time of first tx + 5 minutes

        await setBlockTime(newTimestamp)

        expect(await contract.connect(user2).countMinutes()).to.equal(5)
        expect(await contract.connect(user2).getIndex()).to.equal(3)

        await expect(contract.connect(user2).commit(commitMessageUser2)).to.emit(contract, "FinishGameUnsuccesfully").withArgs(await user1.getAddress(), "The second user doesn't be on time")

        await expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(0)
    })

    it("should reveal correctly", async function() {
        const {user1, user2, contract} = await loadFixture(deploy)

        const gameCost = 1_000_000;
        await contract.connect(user1).registration({value: gameCost})
        await contract.connect(user2).registration({value: gameCost})

        const commitMessageUser1 = ethers.solidityPackedKeccak256(["uint8", "bytes32"], [1, ethers.encodeBytes32String("secret")]);
        const commitMessageUser2 = ethers.solidityPackedKeccak256(["uint8", "bytes32"], [0, ethers.encodeBytes32String("secr")])

        await expect(contract.connect(user1).commit(commitMessageUser1)).to.emit(contract, "StepEvent").withArgs(await user1.getAddress())
        await expect(contract.connect(user2).commit(commitMessageUser2)).to.emit(contract, "StepEvent").withArgs(await user2.getAddress())

        await contract.connect(user1).reveal(1, ethers.encodeBytes32String("secret"))

        expect(await contract.getIndex()).to.equal(5)

        await expect(contract.connect(user2).reveal(0, ethers.encodeBytes32String("secr"))).to.emit(contract, "WienerEvent").withArgs(await user1.getAddress(), 1, await user2.getAddress(), 0)
        
        //check error 
        await expect(contract.connect(user2).reveal(0, ethers.encodeBytes32String("secr"))).to.be.revertedWithCustomError(contract, "NotPlayerOrPlayed")

        expect(await contract.startTime()).to.equal(0)
        expect(await contract.getIndex()).to.equal(0)
        expect(await contract.firstCommited()).to.equal("0x0000000000000000000000000000000000000000")
        expect(await contract.getPayments(await user1.getAddress())).to.equal(0)
        expect(await contract.getPayments(await user2.getAddress())).to.equal(0)
        expect(await contract.getSteps(await user1.getAddress())).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000')
        expect(await contract.getSteps(await user2.getAddress())).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000')

        await expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(0)
    })

    it("should firstPlayer reveal ", async function() {
        const {user1, user2, contract} = await loadFixture(deploy)

        const gameCost = 1_000_000;
        await contract.connect(user1).registration({value: gameCost})
        await contract.connect(user2).registration({value: gameCost})

        const commitMessageUser1 = ethers.solidityPackedKeccak256(["uint8", "bytes32"], [1, ethers.encodeBytes32String("secret")]);
        const commitMessageUser2 = ethers.solidityPackedKeccak256(["uint8", "bytes32"], [0, ethers.encodeBytes32String("secr")])

        await expect(contract.connect(user1).commit(commitMessageUser1)).to.emit(contract, "StepEvent").withArgs(await user1.getAddress())
        await expect(contract.connect(user2).commit(commitMessageUser2)).to.emit(contract, "StepEvent").withArgs(await user2.getAddress())

        await contract.connect(user1).reveal(1, ethers.encodeBytes32String("secret"))

        const newTimestamp = (Number(await contract.connect(user1).startTime()) + (60 * 5)); // time of first tx + 5 minutes

        await setBlockTime(newTimestamp)

        expect(await contract.getIndex()).to.equal(5)

        await expect(contract.connect(user2).reveal(0, ethers.encodeBytes32String("secr"))).to.emit(contract, "FinishGameUnsuccesfully").withArgs(await user2.getAddress(), "The second user doesn't be on time")

        expect(await contract.startTime()).to.equal(0)

        await expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(0)
    })

    async function setBlockTime(newTimestamp: number) {
        await network.provider.send('evm_setNextBlockTimestamp', [newTimestamp]);
        await network.provider.send('evm_mine');
    }
})


git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/Verefrint/dz_12.git
git push -u origin main
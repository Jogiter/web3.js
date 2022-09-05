/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { Contract, PayableTxOptions } from 'web3-eth-contract';
import { sha3, toChecksumAddress } from 'web3-utils';

import { Address, Bytes, TransactionReceipt } from 'web3-types';
import { ENS } from '../../src';
import { namehash } from '../../src/utils';

import { getSystemTestAccounts, getSystemTestProvider } from '../fixtures/system_tests_utils';

import { FIFSRegistrarAbi, FIFSRegistrarBytecode } from '../fixtures/ens/FIFSRegistrar';
import { ENSRegistryAbi, ENSRegistryBytecode } from '../fixtures/ens/ENSRegistry';
import { DummyNameWrapperApi, DummyNameWrapperBytecode } from '../fixtures/ens/DummyNameWrapper';
import { PublicResolverAbi, PublicResolverBytecode } from '../fixtures/ens/PublicResolver';
import { ReverseRegistrarAbi, ReverseRegistarBytecode } from '../fixtures/ens/ReverseRegistrar';

describe('ens', () => {
	let registry: Contract<typeof ENSRegistryAbi>;
	let resolver: Contract<typeof PublicResolverAbi>;
	let nameWrapper: Contract<typeof DummyNameWrapperApi>;
	let registrar: Contract<typeof FIFSRegistrarAbi>;
	let reverseRegistrar: Contract<typeof ReverseRegistrarAbi>;

	let Resolver: Contract<typeof PublicResolverAbi>;

	let sendOptions: PayableTxOptions;

	const domain = 'test';
	const node = namehash('resolver');
	const label = sha3('resolver') as string;

	const subdomain = 'subdomain';
	const web3jsName = 'web3js.test';

	const ttl = 3600;

	let accounts: string[];
	let ens: ENS;
	let defaultAccount: string;

	const ZERO_NODE: Bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';
	const addressOne: Address = '0x0000000000000000000000000000000000000001';

	beforeAll(async () => {
		accounts = await getSystemTestAccounts();

		[defaultAccount] = accounts;

		sendOptions = { from: defaultAccount, gas: '10000000' };

		const Registry = new Contract(ENSRegistryAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		const DummyNameWrapper = new Contract(DummyNameWrapperApi, undefined, {
			provider: getSystemTestProvider(),
		});

		Resolver = new Contract(PublicResolverAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		const FifsRegistrar = new Contract(FIFSRegistrarAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		const ReverseRegistar = new Contract(ReverseRegistrarAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		registry = await Registry.deploy({ data: ENSRegistryBytecode }).send(sendOptions);

		nameWrapper = await DummyNameWrapper.deploy({ data: DummyNameWrapperBytecode }).send(
			sendOptions,
		);

		resolver = await Resolver.deploy({
			data: PublicResolverBytecode,
			arguments: [
				registry.options.address as string,
				nameWrapper.options.address as string,
				accounts[1],
				defaultAccount,
			],
		}).send(sendOptions);

		await registry.methods.setSubnodeOwner(ZERO_NODE, label, defaultAccount).send(sendOptions);
		await registry.methods
			.setResolver(node, resolver.options.address as string)
			.send(sendOptions);
		await resolver.methods.setAddr(node, addressOne).send(sendOptions);

		registrar = await FifsRegistrar.deploy({
			data: FIFSRegistrarBytecode,
			arguments: [registry.options.address as string, namehash(domain)],
		}).send(sendOptions);

		await registry.methods
			.setSubnodeOwner(ZERO_NODE, sha3(domain) as string, defaultAccount)
			.send(sendOptions);

		reverseRegistrar = await ReverseRegistar.deploy({
			data: ReverseRegistarBytecode,
			arguments: [registry.options.address as string],
		}).send(sendOptions);

		await registry.methods
			.setSubnodeOwner(ZERO_NODE, sha3('reverse') as string, defaultAccount)
			.send(sendOptions);

		await registry.methods
			.setSubnodeOwner(
				namehash('reverse'),
				sha3('adr') as string,
				reverseRegistrar.options.address as string,
			)
			.send(sendOptions);

		ens = new ENS(
			registry.options.address,
			new ENS.providers.HttpProvider(getSystemTestProvider()),
		);
	});

	it('should return the subnode owner of "resolver"', async () => {
		const owner = await ens.getOwner('resolver');

		expect(owner).toEqual(toChecksumAddress(defaultAccount));
	});

	it('should return the registered resolver for the subnode "resolver"', async () => {
		const ensResolver = await ens.getResolver('resolver');

		expect(ensResolver.options.address).toEqual(resolver.options.address);
	});

	it('should set resolver', async () => {
		const newResolver = await Resolver.deploy({
			data: PublicResolverBytecode,
			arguments: [
				registry.options.address as string,
				nameWrapper.options.address as string,
				accounts[1],
				defaultAccount,
			],
		}).send(sendOptions);

		await ens.setResolver('resolver', newResolver.options.address as string, {
			from: defaultAccount,
		});

		const ensResolver = await ens.getResolver('resolver');

		expect(ensResolver.options.address).toEqual(newResolver.options.address);
	});

	it('should set the owner record for a name', async () => {
		// set up subnode
		await registry.methods
			.setSubnodeOwner(namehash('test'), sha3('web3js') as string, defaultAccount)
			.send(sendOptions);

		const receipt = await ens.setOwner(web3jsName, accounts[1], { from: defaultAccount });

		expect(receipt).toEqual(
			expect.objectContaining({
				// status: BigInt(1),
				transactionHash: expect.any(String),
			}),
		);

		expect((receipt as TransactionReceipt).status).toEqual(BigInt(1));
	});

	it('should get the owner record for a name', async () => {
		const web3jsOwner = await ens.getOwner(web3jsName);

		expect(web3jsOwner).toEqual(toChecksumAddress(accounts[1]));
	});

	it('should get TTL', async () => {
		const TTL = await ens.getTTL(web3jsName);

		expect(TTL).toBe('0');
	});

	it('should set TTL', async () => {
		await ens.setTTL(web3jsName, ttl, { from: accounts[1] });

		const ttlResult = await ens.getTTL(web3jsName);

		expect(ttlResult).toBe(ttl.toString());
	});

	it('should set subnode owner', async () => {
		// set up subnode
		await registry.methods
			.setSubnodeOwner(namehash('test'), sha3('subnode') as string, defaultAccount)
			.send(sendOptions);

		await ens.setSubnodeOwner('test', 'subnode', accounts[1], {
			from: defaultAccount,
		});

		const owner = await ens.getOwner(`subnode.test`);

		expect(owner).toBe(toChecksumAddress(accounts[1]));
	});

	it('should set subnode record', async () => {
		// set up subnode
		await registry.methods
			.setSubnodeOwner(namehash('test'), sha3(subdomain) as string, defaultAccount)
			.send(sendOptions);

		await ens.setSubnodeRecord(
			'test',
			subdomain,
			accounts[1],
			resolver.options.address as string,
			ttl,
			{ from: defaultAccount },
		);

		const ttlResult = await ens.getTTL(`${subdomain}.test`);

		const owner = await ens.getOwner(`${subdomain}.test`);

		expect(ttlResult).toBe(ttl.toString());
		expect(owner).toBe(toChecksumAddress(accounts[1]));
	});

	it('shoud record exists', async () => {
		await registry.methods
			.setSubnodeOwner(namehash('test'), sha3(subdomain) as string, defaultAccount)
			.send(sendOptions);

		const exists = await ens.recordExists('subdomain.test');

		expect(exists).toBeTruthy();
	});
	it('shoud set record', async () => {
		await registry.methods
			.setSubnodeOwner(namehash('test'), sha3(subdomain) as string, defaultAccount)
			.send(sendOptions);

		await ens.setRecord('test', accounts[1], resolver.options.address as string, ttl, {
			from: defaultAccount,
		});

		const owner = await ens.getOwner('test');
		expect(owner).toBe(toChecksumAddress(accounts[1]));
	});

	it('should set approval for all', async () => {
		await expect(
			ens.setApprovalForAll(accounts[1], true, { from: defaultAccount }),
		).resolves.toBeDefined();
	});

	it('should check approval for all', async () => {
		await expect(
			ens.setApprovalForAll(accounts[1], true, { from: defaultAccount }),
		).resolves.toBeDefined();

		const isApproved = await ens.isApprovedForAll(defaultAccount, accounts[1]);

		expect(isApproved).toBeTruthy();
	});
});

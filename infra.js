const yargs = require('yargs');
const {
    ECSClient,
    DescribeServicesCommand,
    DeleteServiceCommand,
    UpdateServiceCommand
} = require("@aws-sdk/client-ecs");

const describeService = async (argv) => {
    const client = new ECSClient({ region: argv.region });
    const input = {
        cluster: argv.cluster,
        services: [argv.serviceName]
    }
    const command = new DescribeServicesCommand(input);
    const response = await client.send(command);
    console.log(response);
}

const updateWrapper = async (argv, desiredCount) => {
    const client = new ECSClient({ region: argv.region });
    const input = {
        cluster: argv.cluster,
        service: argv.serviceName,
        desiredCount: desiredCount
    }
    const command = new UpdateServiceCommand(input);
    const response = await client.send(command);
    console.log(response);
}

const upService = async (argv) => {
    await updateWrapper(argv, 1);
}

const downService = async (argv) => {
    await updateWrapper(argv, 0);
}

const deleteService = async (argv) => {
    const client = new ECSClient({ region: argv.region });
    const input = {
        cluster: argv.cluster,
        force: true,
        service: argv.serviceName
    }
    const command = new DeleteServiceCommand(input);
    const response = await client.send(command);
    console.log(response);
};

yargs(process.argv.splice(2))
    .command('describe', 'up fargate service', () => {}, describeService)
    .command('up', 'up fargate service', () => {}, upService)
    .command('down', 'down fargate service', () => {}, downService)
    .command('delete', 'delete service', () => {}, deleteService)
    .strict()
    .option('c', {
        array: false,
        description: 'cluster arn',
        default: '',
        alias: 'cluster'
    })
    .option('r', {
        array: false,
        description: 'region',
        default: '',
        alias: 'region'
    })
    .option('s', {
        alias: 'service-name',
        description: 'service name'
    })
    .help('h').argv;
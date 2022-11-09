const yargs = require('yargs');
const { ECSClient, DescribeServicesCommand, DeleteServiceCommand } = require("@aws-sdk/client-ecs");


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

const deployService = async () => {
}

const undeployService = async () => {
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
    .command('deploy', 'up fargate service', () => {}, deployService)
    .command('undeploy', 'down fargate service', () => {}, undeployService)
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
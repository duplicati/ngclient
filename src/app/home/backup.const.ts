export type BackupTemp = {
  id: string;
  organizationId: string;
  machineId: string;
  machineName: string;
  endTime: string;
  duration: string | null;
  source: number | null;
  destination: number | null;
  version: string | null;
  machineTags: string[];
  latestBackupReports: {
    backupReportId: string;
    endTime: string;
    status: string | null;
  }[];
};

export const BACKUPS: BackupTemp[] = [
  {
    id: '08eca0fb-8f4d-408d-a5db-7408d7ad5922-1234test',
    organizationId: '08eca0fb-8f4d-408d-a5db-7408d7ad5922',
    machineId: '1234test',
    machineName: '1234test2',
    endTime: '2024-07-08T05:00:02.176194+00:00',
    duration: '00:00:01.8431440',
    source: 73193356,
    destination: 69703215,
    version: '1.0.0.0 (Current)',
    machineTags: [],
    latestBackupReports: [
      {
        backupReportId: '76199ce1-b9e8-47d2-9a66-606ff9983b35',
        endTime: '2024-07-04T20:26:19.361749+00:00',
        status: 'Success',
      },
      {
        backupReportId: '954cefb9-aaeb-41ed-92a0-0759d533e1ae',
        endTime: '2024-07-04T20:28:30.435824+00:00',
        status: 'Success',
      },
      {
        backupReportId: '035ac9ea-44a1-4747-bf7d-d23daf556a50',
        endTime: '2024-07-04T20:35:53.290829+00:00',
        status: 'Success',
      },
      {
        backupReportId: 'e9597e50-882b-40ff-8f0d-d52639028665',
        endTime: '2024-07-04T20:37:13.605541+00:00',
        status: 'Success',
      },
      {
        backupReportId: '22f18ac8-9ee4-4454-876f-e2b43a9cd6f4',
        endTime: '2024-07-06T09:06:11.920107+00:00',
        status: 'Success',
      },
      {
        backupReportId: '560d42e3-fa66-4fbc-9fbb-5941ec26bdf2',
        endTime: '2024-07-06T10:10:33.107455+00:00',
        status: 'Success',
      },
      {
        backupReportId: '9bf75628-1d72-4dfd-a777-6a4ef4fad4a4',
        endTime: '2024-07-06T10:19:33.706844+00:00',
        status: 'Success',
      },
      {
        backupReportId: 'f35647c7-8bf9-4b45-b103-a285f247ac8a',
        endTime: '2024-07-06T19:58:50.284511+00:00',
        status: 'Error',
      },
      {
        backupReportId: '3bb116c5-7046-4820-adaf-5f8ef461643f',
        endTime: '2024-07-07T08:32:55.142756+00:00',
        status: 'Error',
      },
      {
        backupReportId: '4da96a66-cf6e-461f-abd1-efa300b3e071',
        endTime: '2024-07-08T05:00:03.069452+00:00',
        status: 'Success',
      },
    ],
  },
  {
    id: '08eca0fb-8f4d-408d-a5db-7408d7ad5922-UNKNOWN',
    organizationId: '08eca0fb-8f4d-408d-a5db-7408d7ad5922',
    machineId: 'UNKNOWN',
    machineName: 'UNKNOWN',
    endTime: '2024-07-04T13:53:55.989892+00:00',
    duration: null,
    source: null,
    destination: null,
    version: null,
    machineTags: [],
    latestBackupReports: [
      {
        backupReportId: 'db8870da-a979-4eb5-b880-0213a6c0c6dd',
        endTime: '2024-06-19T13:29:46.249283+00:00',
        status: null,
      },
      {
        backupReportId: '89e85445-860b-4f9a-b2bd-756682955993',
        endTime: '2024-06-19T13:29:46.42688+00:00',
        status: 'Success',
      },
      {
        backupReportId: '578c6b63-2e32-4116-a639-f5b9a7cb0c5b',
        endTime: '2024-06-19T13:29:46.580843+00:00',
        status: null,
      },
      {
        backupReportId: '4c3d7796-a08e-4916-969a-c7b0721749b3',
        endTime: '2024-06-19T13:29:46.750381+00:00',
        status: null,
      },
      {
        backupReportId: '50d8a246-36eb-46f2-bcf6-602ace2421ee',
        endTime: '2024-06-19T13:29:47.015853+00:00',
        status: 'Success',
      },
      {
        backupReportId: '247ba9f4-4a03-4b6e-9dcd-8b76182c326b',
        endTime: '2024-07-04T13:53:53.921397+00:00',
        status: null,
      },
      {
        backupReportId: '94ba04e5-dce3-48ee-b41e-4ce1a0222df1',
        endTime: '2024-07-04T13:53:55.538234+00:00',
        status: 'Success',
      },
      {
        backupReportId: '3115d9e3-952c-4472-be45-6b246ce8d5a6',
        endTime: '2024-07-04T13:53:55.729932+00:00',
        status: null,
      },
      {
        backupReportId: 'de62f4a0-091e-416c-88b3-37f4c481efbd',
        endTime: '2024-07-04T13:53:55.989892+00:00',
        status: null,
      },
      {
        backupReportId: '0172ccab-e2c5-43d5-acd2-67266b9ce9e6',
        endTime: '2024-07-04T13:53:56.279706+00:00',
        status: 'Success',
      },
    ],
  },
  {
    id: '08eca0fb-8f4d-408d-a5db-7408d7ad5922-b3c774b874914bc98bc6964727e7e7c4',
    organizationId: '08eca0fb-8f4d-408d-a5db-7408d7ad5922',
    machineId: 'b3c774b874914bc98bc6964727e7e7c4',
    machineName: 'hello world',
    endTime: '2024-05-29T13:37:44.775107+00:00',
    duration: '00:00:01.0571230',
    source: 70109345,
    destination: 67349385,
    version: '1.0.0.0 (Current)',
    machineTags: [],
    latestBackupReports: [
      {
        backupReportId: '0d02b3e4-384e-4aec-9d16-a4bac601e05e',
        endTime: '2024-05-29T13:37:45.62437+00:00',
        status: 'Success',
      },
    ],
  },
];

import { useIntersectionObserver, useSyncedRef, useUnmountEffect } from '@react-hookz/web/esm'
import { useReactTable, createTable, getSortedRowModel, getFilteredRowModel, getCoreRowModel } from '@tanstack/react-table'
import classnames from 'classnames'
import { groupBy } from 'lodash-es'
import { useMemo, useLayoutEffect, useRef, useState, useEffect } from 'react'

import { Header, Checkbox, Modal, Icon, Drawer, Card, Button } from '@components'
import { fromNow } from '@lib/date'
import { basePath, formatTraffic } from '@lib/helper'
import { useObject, useVisible } from '@lib/hook'
import * as API from '@lib/request'
import { BaseComponentProps } from '@models'
import { useClient, useConnectionStreamReader, useI18n } from '@stores'

import { Devices } from './Devices'
import { ConnectionInfo } from './Info'
import { Connection, FormatConnection, useConnections } from './store'
import './style.scss'

const Columns = {
    Host: 'host',
    SniffHost: 'sniffHost',
    Network: 'network',
    Process: 'process',
    Type: 'type',
    Chains: 'chains',
    Rule: 'rule',
    Speed: 'speed',
    Upload: 'upload',
    Download: 'download',
    SourceIP: 'sourceIP',
    DestinationIP: 'destinationIP',
    Time: 'time',
} as const

const shouldCenter = new Set<string>([Columns.Network, Columns.Type, Columns.Speed, Columns.Upload, Columns.Download, Columns.SourceIP, Columns.Time, Columns.Process])

function formatSpeed (upload: number, download: number) {
    switch (true) {
        case upload === 0 && download === 0:
            return '-'
        case upload !== 0 && download !== 0:
            return `↑ ${formatTraffic(upload)}/s ↓ ${formatTraffic(download)}/s`
        case upload !== 0:
            return `↑ ${formatTraffic(upload)}/s`
        default:
            return `↓ ${formatTraffic(download)}/s`
    }
}

const table = createTable<FormatConnection>({
    debugAll: false,
    columns: [],
    data: [],
    getCoreRowModel: getCoreRowModel(),
    onStateChange: () => {},
    renderFallbackValue: null,
    state: {},
})

export default function Connections () {
    const { translation, lang } = useI18n()
    const t = useMemo(() => translation('Connections').t, [translation])
    const connStreamReader = useConnectionStreamReader()
    const readerRef = useSyncedRef(connStreamReader)
    const client = useClient()
    const cardRef = useRef<HTMLDivElement>(null)

    // total
    const [traffic, setTraffic] = useObject({
        uploadTotal: 0,
        downloadTotal: 0,
    })

    // close all connections
    const { visible, show, hide } = useVisible()
    function handleCloseConnections () {
        client.closeAllConnections().finally(() => hide())
    }

    // connections
    const { connections, feed, save, toggleSave } = useConnections()
    const data: FormatConnection[] = useMemo(() => connections.map(
        c => ({
            id: c.id,
            host: `${c.metadata.host || c.metadata.destinationIP}:${c.metadata.destinationPort}`,
            sniffHost: c.metadata.sniffHost,
            chains: c.chains.slice().reverse().join(' / '),
            rule: c.rulePayload ? `${c.rule} :: ${c.rulePayload}` : c.rule,
            time: new Date(c.start).getTime(),
            upload: c.upload,
            download: c.download,
            sourceIP: c.metadata.sourceIP,
            destinationIP: `${c.metadata.remoteDestination || c.metadata.destinationIP || c.metadata.host}`,
            type: c.metadata.type,
            network: c.metadata.network.toUpperCase(),
            process: c.metadata.processPath,
            speed: { upload: c.uploadSpeed, download: c.downloadSpeed },
            completed: !!c.completed,
            original: c,
        }),
    ), [connections])
    const devices = useMemo(() => {
        const gb = groupBy(connections, 'metadata.sourceIP')
        return Object.keys(gb)
            .map(key => ({ label: key, number: gb[key].length }))
            .sort((a, b) => a.label.localeCompare(b.label))
    }, [connections])

    // table
    const pinRef = useRef<HTMLTableCellElement>(null)
    const intersection = useIntersectionObserver(pinRef, { threshold: [1] })
    const columns = useMemo(
        () => [
            {
                id: Columns.Host,
                accessorKey: Columns.Host,
                header: t(`columns.${Columns.Host}`),
                minSize: 260,
                size: 260,
            },
            {
                id: Columns.SniffHost,
                accessorKey: Columns.SniffHost,
                header: t(`columns.${Columns.SniffHost}`),
                minSize: 260,
                size: 200,
            },
            {
                id: Columns.Network,
                accessorKey: Columns.Network,
                header: t(`columns.${Columns.Network}`),
                minSize: 80,
                size: 80,
            },
            {
                id: Columns.Type,
                accessorKey: Columns.Type,
                header: t(`columns.${Columns.Type}`),
                minSize: 100,
                size: 100,
            },
            {
                id: Columns.Chains,
                accessorKey: Columns.Chains,
                header: t(`columns.${Columns.Chains}`),
                minSize: 200,
                size: 200,
            },
            {
                id: Columns.Rule,
                accessorKey: Columns.Rule,
                header: t(`columns.${Columns.Rule}`),
                minSize: 140,
                size: 140,
            },
            {
                id: Columns.Process,
                accessorKey: Columns.Process,
                header: t(`columns.${Columns.Process}`),
                minSize: 100,
                size: 100,
                cell: ({ getValue }) => getValue() ? basePath(getValue()) : '-'
            },
            {
                id: Columns.Speed,
                accessorFn: row => [row.speed.upload, row.speed.download],
                header: t(`columns.${Columns.Speed}`),
                minSize: 200,
                size: 200,
                sortDescFirst: true,
                sortingFn: (rowA, rowB) => {
                    const speedA = rowA.original?.speed ?? { upload: 0, download: 0 }
                    const speedB = rowB.original?.speed ?? { upload: 0, download: 0 }
                    return speedA.download === speedB.download
                        ? speedA.upload - speedB.upload
                        : speedA.download - speedB.download
                },
                cell: ({ getValue }) => formatSpeed(getValue()[0], getValue()[1])
            },
            {
                id: Columns.Upload,
                accessorKey: Columns.Upload,
                header: t(`columns.${Columns.Upload}`),
                minSize: 100,
                size: 100,
                cell: ({ getValue }) => formatTraffic(getValue())
            },
            {
                id: Columns.Download,
                accessorKey: Columns.Download,
                header: t(`columns.${Columns.Download}`),
                minSize: 100,
                size: 100,
                cell: ({ getValue }) => formatTraffic(getValue())
            },
            {
                id: Columns.SourceIP,
                accessorKey: Columns.SourceIP,
                header: t(`columns.${Columns.SourceIP}`),
                minSize: 140,
                size: 140,
                filterFn: 'equals'
            },
            {
                id: Columns.DestinationIP,
                accessorKey: Columns.DestinationIP,
                header: t(`columns.${Columns.DestinationIP}`),
                minSize: 140,
                size: 140,
            },
            {
                id: Columns.Time,
                accessorKey: Columns.Time,
                header: t(`columns.${Columns.Time}`),
                minSize: 120,
                size: 120,
                cell: ({ getValue }) => fromNow(new Date(getValue()), lang),
                sortingFn: (rowA, rowB) => (rowB.original?.time ?? 0) - (rowA.original?.time ?? 0)
            },
        ],
        [lang, t]
    )

    useLayoutEffect(() => {
        function handleConnection (snapshots: API.Snapshot[]) {
            for (const snapshot of snapshots) {
                setTraffic({
                    uploadTotal: snapshot.uploadTotal,
                    downloadTotal: snapshot.downloadTotal,
                })

                feed(snapshot.connections)
            }
        }

        connStreamReader?.subscribe('data', handleConnection)
        return () => {
            connStreamReader?.unsubscribe('data', handleConnection)
        }
    }, [connStreamReader, feed, setTraffic])
    useUnmountEffect(() => {
        readerRef.current?.destory()
    })

    const instance = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        initialState: {
            sorting: [{ id: Columns.Time, desc: false }],
        },
        columnResizeMode: 'onChange',
        enableColumnResizing: true
    })

    const headerGroup = instance.getHeaderGroups()[0]

    // filter
    const [device, setDevice] = useState('')
    function handleDeviceSelected (label: string) {
        setDevice(label)
        instance.setColumnFilters([
            { id: Columns.SourceIP, value: label || undefined }
        ])
    }

    // click item
    const [drawerState, setDrawerState] = useObject({
        visible: false,
        selectedID: '',
        connection: {} as Partial<Connection>,
    })
    function handleConnectionClosed () {
        setDrawerState(d => { d.connection.completed = true })
        client.closeConnection(drawerState.selectedID)
    }
    const latestConntion = useSyncedRef(drawerState.connection)
    useEffect(() => {
        const conn = data.find(c => c.id === drawerState.selectedID)?.original
        if (conn) {
            setDrawerState(d => {
                d.connection = { ...conn }
                if (drawerState.selectedID === latestConntion.current.id) {
                    d.connection.completed = latestConntion.current.completed
                }
            })
        } else if (Object.keys(latestConntion.current).length !== 0 && !latestConntion.current.completed) {
            setDrawerState(d => { d.connection.completed = true })
        }
    }, [data, drawerState.selectedID, latestConntion, setDrawerState])

    const scrolled = useMemo(() => (intersection?.intersectionRatio ?? 0) < 1, [intersection])
    const headers = headerGroup.headers.map((header, idx) => {
        const column = header.column
        const id = column.id
        return (
            <th
                key={header.id}
                className={classnames('connections-th', {
                    resizing: header.column.getIsResizing(),
                    fixed: header.column.id === Columns.Host,
                    shadow: scrolled && header.column.id === Columns.Host,
                })}
                style={{ width: header.getSize() }}
                ref={header.column.id === Columns.Host ? pinRef : undefined}>
                <div onClick={() => header.column.toggleSorting()}>
                    {header.column.columnDef.header as string}
                    {
                        header.column.getIsSorted() !== false
                            ? header.column.getIsSorted() === 'desc' ? ' ↓' : ' ↑'
                            : null
                    }
                </div>
                { idx !== headerGroup.headers.length - 1 &&
                    <div {...header.getResizeHandler()} className="connections-resizer" />
                }
            </th>
        )
    })

    const content = instance.getRowModel().rows.map(row => {
        return (
            <tr
                className="cursor-default select-none"
                key={row.original?.id}
                onClick={() => setDrawerState({ visible: true, selectedID: row.original?.id })}>
                {
                    row.getAllCells().map(cell => {
                        return (
                            <td
                                key={cell.column.id}
                                className={classnames(
                                    'connections-block',
                                    { 'text-center': shouldCenter.has(cell.column.id), completed: row.original?.completed },
                                    {
                                        fixed: cell.column.id === Columns.Host,
                                        shadow: scrolled && cell.column.id === Columns.Host,
                                    },
                                )}
                                style={{ width: cell.column.getSize() }}>
                                { cell.renderValue() as React.ReactNode }
                            </td>
                        )
                    })
                }
            </tr>
        )
    })

    return (
        <div className="page !h-100vh">
            <Header title={t('title')}>
                <span className="cursor-default flex-1 connections-filter">
                    {`(${t('total.text')}: ${t('total.upload')} ${formatTraffic(traffic.uploadTotal)} ${t('total.download')} ${formatTraffic(traffic.downloadTotal)})`}
                </span>
                <Checkbox className="connections-filter" checked={save} onChange={toggleSave}>{t('keepClosed')}</Checkbox>
                <Icon className="connections-filter dangerous" onClick={show} type="close-all" size={20} />
            </Header>
            { devices.length > 1 && <Devices devices={devices} selected={device} onChange={handleDeviceSelected} /> }
            <Card ref={cardRef} className="connections-card relative">
                <div className="overflow-auto min-h-full min-w-full">
                    <table>
                        <thead>
                            <tr className="connections-header">
                                { headers }
                            </tr>
                        </thead>

                        <tbody>
                            { content }
                        </tbody>
                    </table>
                </div>
            </Card>
            <Modal title={t('closeAll.title')} show={visible} onClose={hide} onOk={handleCloseConnections}>{t('closeAll.content')}</Modal>
            <Drawer containerRef={cardRef} bodyClassName="flex flex-col bg-[#15222a] text-[#b7c5d6]" visible={drawerState.visible} width={450}>
                <div className="flex h-8 justify-between items-center">
                    <span className="font-bold pl-3">{t('info.title')}</span>
                    <Icon type="close" size={16} className="cursor-pointer" onClick={() => setDrawerState('visible', false)} />
                </div>
                <ConnectionInfo className="mt-3 px-5" connection={drawerState.connection} />
                <div className="flex mt-3 pr-3 justify-end">
                    <Button type="danger" disiabled={drawerState.connection.completed} onClick={() => handleConnectionClosed()}>{ t('info.closeConnection') }</Button>
                </div>
            </Drawer>
        </div>
    )
}

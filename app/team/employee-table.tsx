'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Plus } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils/format'

interface Employee {
  id: string
  name: string
  role: string
  fully_loaded_annual: number
  start_date: string
}

type SortKey = 'name' | 'role' | 'fully_loaded_annual' | 'start_date'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function EmployeeTable({ employees }: { employees: Employee[] }) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const sorted = [...employees].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    if (sortKey === 'fully_loaded_annual') {
      return ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)) * dir
    }
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const form = new FormData(e.currentTarget)
    const payload = {
      name: form.get('name') as string,
      role: form.get('role') as string,
      annual_salary: Number(form.get('annual_salary')),
      benefits_annual: Number(form.get('benefits_annual')),
      start_date: form.get('start_date') as string,
    }

    try {
      const res = await fetch('/api/headcount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to add employee')
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add employee')
    } finally {
      setSubmitting(false)
    }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    return (
      <TableHead
        className="cursor-pointer select-none"
        onClick={() => toggleSort(field)}
      >
        <div className="flex items-center gap-1">
          {label}
          <ArrowUpDown className="size-3 text-muted-foreground" />
        </div>
      </TableHead>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Employees</h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" />
          Add Employee
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader label="Name" field="name" />
            <SortHeader label="Role" field="role" />
            <SortHeader label="Fully Loaded Cost" field="fully_loaded_annual" />
            <SortHeader label="Start Date" field="start_date" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No employees added yet
              </TableCell>
            </TableRow>
          )}
          {sorted.map((emp) => (
            <TableRow key={emp.id}>
              <TableCell className="font-medium">{emp.name}</TableCell>
              <TableCell>{emp.role}</TableCell>
              <TableCell>
                {formatCurrency(Number(emp.fully_loaded_annual))}
              </TableCell>
              <TableCell>{formatDate(emp.start_date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={(value) => setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>
              Enter employee details. Fully loaded cost is computed
              automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="emp-name" className="text-sm font-medium leading-none">
                Name
              </label>
              <Input id="emp-name" name="name" required autoFocus />
            </div>
            <div className="space-y-2">
              <label htmlFor="emp-role" className="text-sm font-medium leading-none">
                Role
              </label>
              <Input id="emp-role" name="role" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="emp-salary"
                  className="text-sm font-medium leading-none"
                >
                  Annual Salary
                </label>
                <Input
                  id="emp-salary"
                  name="annual_salary"
                  type="number"
                  min={0}
                  step={1000}
                  required
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="emp-benefits"
                  className="text-sm font-medium leading-none"
                >
                  Benefits (Annual)
                </label>
                <Input
                  id="emp-benefits"
                  name="benefits_annual"
                  type="number"
                  min={0}
                  step={100}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="emp-start"
                className="text-sm font-medium leading-none"
              >
                Start Date
              </label>
              <Input id="emp-start" name="start_date" type="date" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adding\u2026' : 'Add Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

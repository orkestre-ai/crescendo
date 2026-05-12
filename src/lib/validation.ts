import { z } from 'zod';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

const cuidSchema = z.string().cuid();

/**
 * Validate a URL path parameter as a valid CUID.
 * Returns null if valid, or a 400 NextResponse if invalid.
 */
export function validateCuid(id: string): NextResponse | null {
  const result = cuidSchema.safeParse(id);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid ID format', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }
  return null;
}

/**
 * Check if an error is a Prisma "record not found" error (P2025).
 */
export function isPrismaNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

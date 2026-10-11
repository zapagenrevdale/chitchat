# RI-005/006

Bug-fix workflow adapted to the delegated scope.

- [x] Read constraints and principles; preserve pre-edit copies and scoped baseline diff.
- [x] Reproduce with controlled RAF and visible canvas bars.
- [x] Confirm lifecycle mechanism and implement the bounded fix.
- [x] Verify original reproductions with targeted tests, web typecheck and scoped lint.
- Parent owns browser verification, design exploration and independent review.
- Skip nested agents, commits and PRs per explicit scope. Preserve red/green logs.

Throughput checkpoint. Three exclusive files; deterministic queue tests first, bounded lifecycle patch second, targeted tests and checks last. Existing preview guards need coverage rather than a production rewrite.

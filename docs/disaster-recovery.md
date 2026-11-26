# Zenve Vet Platform — Disaster Recovery & Business Continuity Plan

## 1. RPO & RTO Targets
- **Recovery Point Objective (RPO)**: < 1 hour (Automated hourly database snapshot & replication)
- **Recovery Time Objective (RTO)**: < 15 minutes (Automated Kubernetes rollback & stateful volume re-attach)

---

## 2. Backup Strategy
| Component | Frequency | Storage Location | Retention |
|---|---|---|---|
| **MySQL Master Database** | Hourly incremental + Daily full dump | AWS S3 / Encrypted Persistent Volume | 30 Days |
| **Media Uploads (/uploads)** | Continuous object sync | AWS S3 Multi-AZ / Distributed Ceph | Indefinite |
| **Redis Cache & Sessions** | AOF every second + RDB snapshot every 60s | Kubernetes PersistentVolumeClaim | 7 Days |
| **Kubernetes State & Secrets** | Velero cluster backup daily | Cloud Storage Vault | 90 Days |

---

## 3. Incident Response Procedures

### Scenario A: Complete Database Corruption or Data Loss
1. Stop backend traffic:
   ```bash
   kubectl scale deployment zenve-vet-backend --replicas=0 -n zenve-vet
   ```
2. Locate the latest validated backup:
   ```bash
   ls -la /backups/mysql/
   ```
3. Run the automated restore script:
   ```bash
   ./scripts/restore-db.sh /backups/mysql/zenvevet_backup_latest.sql.gz
   ```
4. Verify data integrity:
   ```bash
   mysql -h localhost -u root -p -e "SELECT count(*) FROM zenvevet.doctor_profiles;"
   ```
5. Restart backend services:
   ```bash
   kubectl scale deployment zenve-vet-backend --replicas=4 -n zenve-vet
   ```

### Scenario B: Failed Deployment / Bad Release Rollout
1. Check rollout status:
   ```bash
   kubectl rollout status deployment/zenve-vet-backend -n zenve-vet
   ```
2. Instantly rollback to previous stable release:
   ```bash
   kubectl rollout undo deployment/zenve-vet-backend -n zenve-vet
   kubectl rollout undo deployment/zenve-vet-frontend -n zenve-vet
   ```

### Scenario C: Redis Crash or Memory Exhaustion
1. Redis is configured with `allkeys-lru` and cache-aside fallback.
2. If Redis crashes, the backend automatically falls back to in-memory L1 cache and direct MySQL reads.
3. Restart Redis:
   ```bash
   kubectl rollout restart deployment/redis -n zenve-vet
   ```


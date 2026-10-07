"""
Comprehensive test for all Item Master functionality:
1. Add division
2. Add item
3. Manage region
4. Manage organizations
5. Import item
6. Mass delete
"""
import requests
import io

BASE_URL = "http://localhost:8000"

def test_organizations():
    """Test organization CRUD"""
    print("\n" + "="*60)
    print("TESTING ORGANIZATIONS")
    print("="*60)
    
    # 1. Create organization
    print("\n1. Creating organization...")
    resp = requests.post(f"{BASE_URL}/orgs", json={"name": "Test Org"})
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        org = resp.json()
        org_id = org['org_id']
        print(f"   ✓ Created organization: {org['name']} (ID: {org_id})")
    else:
        print(f"   ✗ Failed: {resp.text}")
        return None
    
    # 2. List organizations
    print("\n2. Listing organizations...")
    resp = requests.get(f"{BASE_URL}/orgs")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        orgs = resp.json()
        print(f"   ✓ Found {len(orgs)} organizations")
        for o in orgs:
            print(f"     - {o['name']} (ID: {o['org_id']})")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    # 3. Update organization
    print("\n3. Updating organization...")
    resp = requests.patch(f"{BASE_URL}/orgs/{org_id}", json={"name": "Test Org Updated"})
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        org = resp.json()
        print(f"   ✓ Updated to: {org['name']}")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    return org_id

def test_regions(org_id):
    """Test region CRUD"""
    print("\n" + "="*60)
    print("TESTING REGIONS")
    print("="*60)
    
    # 1. Create region
    print("\n1. Creating region...")
    resp = requests.post(f"{BASE_URL}/orgs/{org_id}/regions", json={"name": "Test Zone"})
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        region = resp.json()
        region_id = region['region_id']
        print(f"   ✓ Created region: {region['name']} (ID: {region_id})")
    else:
        print(f"   ✗ Failed: {resp.text}")
        return None
    
    # 2. List regions
    print("\n2. Listing regions...")
    resp = requests.get(f"{BASE_URL}/orgs/{org_id}/regions")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        regions = resp.json()
        print(f"   ✓ Found {len(regions)} regions")
        for r in regions:
            print(f"     - {r['name']} (ID: {r['region_id']})")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    # 3. Update region
    print("\n3. Updating region...")
    resp = requests.patch(f"{BASE_URL}/orgs/regions/{region_id}", json={"name": "Test Zone Updated"})
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        region = resp.json()
        print(f"   ✓ Updated to: {region['name']}")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    return region_id

def test_divisions(org_id):
    """Test division CRUD"""
    print("\n" + "="*60)
    print("TESTING DIVISIONS")
    print("="*60)
    
    # 1. Create division
    print("\n1. Creating division...")
    resp = requests.post(f"{BASE_URL}/items/divisions", json={
        "name": "Test Division",
        "organization_id": org_id
    })
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        division = resp.json()
        division_id = division['division_id']
        print(f"   ✓ Created division: {division['name']} (ID: {division_id})")
    else:
        print(f"   ✗ Failed: {resp.text}")
        return None
    
    # 2. List divisions
    print("\n2. Listing divisions...")
    resp = requests.get(f"{BASE_URL}/items/divisions")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        divisions = resp.json()
        print(f"   ✓ Found {len(divisions)} divisions")
        for d in divisions:
            print(f"     - {d['name']} (ID: {d['division_id']})")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    return division_id

def test_items(division_id):
    """Test item CRUD"""
    print("\n" + "="*60)
    print("TESTING ITEMS")
    print("="*60)
    
    # 1. Create item
    print("\n1. Creating item...")
    resp = requests.post(f"{BASE_URL}/items", json={
        "division_id": division_id,
        "item_code": "TEST001",
        "item_description": "Test Item",
        "unit": "pc",
        "rate": 100.50,
        "region": "Dhaka Zone",
        "organization": "Test Org Updated"
    })
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        item = resp.json()
        item_id = item['item_id']
        print(f"   ✓ Created item: {item['item_code']} - {item['item_description']} (ID: {item_id})")
    else:
        print(f"   ✗ Failed: {resp.text}")
        return None
    
    # 2. List items
    print("\n2. Listing items...")
    resp = requests.get(f"{BASE_URL}/items")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        items = resp.json()
        print(f"   ✓ Found {len(items)} items")
        for i in items[:5]:  # Show first 5
            print(f"     - {i['item_code']}: {i['item_description']} @ {i['rate']} {i['unit']}")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    # 3. Update item
    print("\n3. Updating item...")
    resp = requests.put(f"{BASE_URL}/items/{item_id}", json={
        "item_description": "Test Item Updated",
        "rate": 150.75
    })
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        item = resp.json()
        print(f"   ✓ Updated: {item['item_description']} @ {item['rate']}")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    return item_id

def test_import():
    """Test import functionality"""
    print("\n" + "="*60)
    print("TESTING IMPORT")
    print("="*60)
    
    # Create test CSV
    test_csv = """Division,Item Code,Description,Unit,Rate,Region
General,IMPORT001,Imported Item 1,sqft,200.00,Dhaka Zone
General,IMPORT002,Imported Item 2,cft,150.00,Comilla Zone
General,IMPORT003,Imported Item 3,pc,100.00,Sylhet Zone
"""
    
    print("\n1. Importing items (append mode)...")
    csv_file = io.BytesIO(test_csv.encode('utf-8'))
    files = {'file': ('test_import.csv', csv_file, 'text/csv')}
    
    resp = requests.post(f"{BASE_URL}/items/import?mode=append", files=files)
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        print(f"   ✓ Message: {result.get('message')}")
        print(f"   ✓ Processed: {result.get('processed')} items")
        print(f"   ✓ Skipped: {result.get('skipped')} items")
        if result.get('errors'):
            print(f"   ⚠ Errors: {result.get('errors')}")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    # Verify imported items
    print("\n2. Verifying imported items...")
    resp = requests.get(f"{BASE_URL}/items")
    if resp.status_code == 200:
        items = resp.json()
        imported = [i for i in items if i['item_code'].startswith('IMPORT')]
        print(f"   ✓ Found {len(imported)} imported items:")
        for i in imported:
            print(f"     - {i['item_code']}: {i['item_description']}")

def test_export():
    """Test export functionality"""
    print("\n" + "="*60)
    print("TESTING EXPORT")
    print("="*60)
    
    # 1. Export CSV
    print("\n1. Exporting items as CSV...")
    resp = requests.get(f"{BASE_URL}/items/export.csv")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        content_length = len(resp.content)
        print(f"   ✓ Exported CSV ({content_length} bytes)")
        # Show first few lines
        lines = resp.text.split('\n')[:5]
        print("   First few lines:")
        for line in lines:
            print(f"     {line}")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    # 2. Export XLSX
    print("\n2. Exporting items as XLSX...")
    resp = requests.get(f"{BASE_URL}/items/export.xlsx")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        content_length = len(resp.content)
        print(f"   ✓ Exported XLSX ({content_length} bytes)")
    else:
        print(f"   ✗ Failed: {resp.text}")

def test_delete(item_id, division_id, region_id, org_id):
    """Test deletion"""
    print("\n" + "="*60)
    print("TESTING DELETION")
    print("="*60)
    
    # 1. Delete item
    print("\n1. Deleting item...")
    resp = requests.delete(f"{BASE_URL}/items/{item_id}")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        item = resp.json()
        print(f"   ✓ Deleted item: {item['item_code']}")
    else:
        print(f"   ✗ Failed: {resp.text}")
    
    # 2. Delete division
    print("\n2. Deleting division...")
    resp = requests.delete(f"{BASE_URL}/items/divisions/{division_id}")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        division = resp.json()
        print(f"   ✓ Deleted division: {division['name']}")
    else:
        print(f"   ⚠ Note: {resp.text}")
    
    # 3. Delete region
    print("\n3. Deleting region...")
    resp = requests.delete(f"{BASE_URL}/orgs/regions/{region_id}")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        region = resp.json()
        print(f"   ✓ Deleted region: {region['name']}")
    else:
        print(f"   ⚠ Note: {resp.text}")
    
    # 4. Delete organization
    print("\n4. Deleting organization...")
    resp = requests.delete(f"{BASE_URL}/orgs/{org_id}")
    print(f"   Status: {resp.status_code}")
    if resp.status_code == 200:
        org = resp.json()
        print(f"   ✓ Deleted organization: {org['name']}")
    else:
        print(f"   ⚠ Note: {resp.text}")

def main():
    print("\n" + "="*60)
    print("ITEM MASTER COMPREHENSIVE FUNCTIONALITY TEST")
    print("="*60)
    print("\nTesting all Item Master features:")
    print("  1. Organizations (create, list, update)")
    print("  2. Regions (create, list, update)")
    print("  3. Divisions (create, list)")
    print("  4. Items (create, list, update)")
    print("  5. Import (CSV upload)")
    print("  6. Export (CSV and XLSX)")
    print("  7. Deletion (items, divisions, regions, orgs)")
    
    try:
        # Test in logical order
        org_id = test_organizations()
        if not org_id:
            print("\n✗ Organization test failed, stopping...")
            return
        
        region_id = test_regions(org_id)
        if not region_id:
            print("\n✗ Region test failed, stopping...")
            return
        
        division_id = test_divisions(org_id)
        if not division_id:
            print("\n✗ Division test failed, stopping...")
            return
        
        item_id = test_items(division_id)
        if not item_id:
            print("\n✗ Item test failed, stopping...")
            return
        
        test_import()
        test_export()
        test_delete(item_id, division_id, region_id, org_id)
        
        print("\n" + "="*60)
        print("✓ ALL TESTS COMPLETED")
        print("="*60)
        
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

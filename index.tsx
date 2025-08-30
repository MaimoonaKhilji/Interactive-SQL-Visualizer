/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useState, useMemo, useEffect, useRef} from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";


// --- DATA DEFINITIONS ---

const customersTable = {
  name: 'Customers',
  columns: ['CustomerID', 'Name', 'Country'],
  rows: [
    { CustomerID: 1, Name: 'Alice', Country: 'USA' },
    { CustomerID: 2, Name: 'Bob', Country: 'Canada' },
    { CustomerID: 3, Name: 'Charlie', Country: 'USA' },
    { CustomerID: 4, Name: 'Diana', Country: 'UK' },
  ],
};

const ordersTable = {
  name: 'Orders',
  columns: ['OrderID', 'Product', 'Amount', 'CustomerID'],
  rows: [
    { OrderID: 101, Product: 'Laptop', Amount: 1200, CustomerID: 1 },
    { OrderID: 102, Product: 'Mouse', Amount: 25, CustomerID: 2 },
    { OrderID: 103, Product: 'Keyboard', Amount: 75, CustomerID: 1 },
    { OrderID: 104, Product: 'Monitor', Amount: 300, CustomerID: 3 },
    { OrderID: 105, Product: 'Webcam', Amount: 50, CustomerID: 5 }, // Belongs to a non-existent customer
  ],
};

const employeesTable = {
  name: 'Employees',
  columns: ['EmployeeID', 'Name', 'Department', 'Salary'],
  rows: [
    { EmployeeID: 104, Name: 'Ivan', Department: 'Engineering', Salary: 110000 },
    { EmployeeID: 103, Name: 'Heidi', Department: 'Engineering', Salary: 95000 },
    { EmployeeID: 105, Name: 'Judy', Department: 'HR', Salary: 60000 },
    { EmployeeID: 106, Name: 'Mallory', Department: 'Sales', Salary: 80000 },
    { EmployeeID: 102, Name: 'Grace', Department: 'Sales', Salary: 75000 },
    { EmployeeID: 101, Name: 'Frank', Department: 'Sales', Salary: 75000 }, // Salary tie
  ]
};

// --- HELPERS for data generation ---
const customerIDsInOrders = new Set(ordersTable.rows.map(o => o.CustomerID));
const customerIDsInCustomers = new Set(customersTable.rows.map(c => c.CustomerID));

// --- SQL TOPICS & EXAMPLES ---

const sqlTopics = {
  'SELECT': {
    description: "The SELECT statement is used to query the database and retrieve data that matches criteria that you specify.",
    syntax: "SELECT column1, column2, ...\nFROM table_name;",
    useCase: "Use it anytime you need to fetch data from a table, whether it's all columns (*) or a specific subset of columns.",
    examples: [
      {
        title: 'Select all columns',
        steps: [
          {
            explanation: 'Start with the base table `Customers`.',
            query: '-- Base Table',
            tables: [customersTable],
          },
          {
            explanation: 'The `SELECT *` statement retrieves all columns from the table.',
            query: 'SELECT * FROM Customers;',
            tables: [{ name: 'Result', ...customersTable }],
          },
        ],
      },
      {
        title: 'Select specific columns',
        steps: [
          {
            explanation: 'Start with the base table `Customers`.',
            query: '-- Base Table',
            tables: [customersTable],
          },
          {
            explanation: 'Specify the column names `Name` and `Country` to retrieve only that data.',
            query: 'SELECT Name, Country FROM Customers;',
            tables: [
              {
                name: 'Result',
                columns: ['Name', 'Country'],
                rows: customersTable.rows.map(({ Name, Country }) => ({ Name, Country })),
              },
            ],
          },
        ],
      },
      {
        title: 'Select with alias',
        steps: [
           {
            explanation: 'Start with the base table `Customers`.',
            query: '-- Base Table',
            tables: [customersTable],
          },
          {
            explanation: 'Use `AS` to rename a column in the output. Here `Name` is renamed to `CustomerName`.',
            query: "SELECT Name AS CustomerName FROM Customers;",
            tables: [
              {
                name: 'Result',
                columns: ['CustomerName'],
                rows: customersTable.rows.map(({ Name }) => ({ CustomerName: Name })),
              },
            ],
          },
        ],
      },
    ]
  },
  'WHERE': {
    description: "The WHERE clause is used to filter records. It extracts only those records that fulfill a specified condition.",
    syntax: "SELECT column1, column2, ...\nFROM table_name\nWHERE condition;",
    useCase: "Use it to narrow down the results of a query, such as finding all customers from a specific country or orders over a certain amount.",
    examples: [
      {
        title: 'Filter with a string value',
        steps: [
           {
            explanation: 'Start with the base table `Customers`.',
            query: '-- Base Table',
            tables: [customersTable],
          },
          {
            explanation: "The `WHERE` clause filters rows based on a condition. Here, we keep only rows where `Country` is 'USA'.",
            query: "SELECT * FROM Customers WHERE Country = 'USA';",
            tables: [
              {
                name: 'Result',
                columns: customersTable.columns,
                rows: customersTable.rows.filter(r => r.Country === 'USA').map(r => ({...r, highlight: true})),
              },
            ],
          },
        ],
      },
       {
        title: 'Filter with a numeric value',
        steps: [
           {
            explanation: 'Start with the base table `Orders`.',
            query: '-- Base Table',
            tables: [ordersTable],
          },
          {
            explanation: "The `WHERE` clause filters rows where `Amount` is greater than 100.",
            query: "SELECT * FROM Orders WHERE Amount > 100;",
            tables: [
              {
                name: 'Result',
                columns: ordersTable.columns,
                rows: ordersTable.rows.filter(r => r.Amount > 100).map(r => ({...r, highlight: true})),
              },
            ],
          },
        ],
      },
    ]
  },
  'INNER JOIN': {
    description: "The INNER JOIN keyword selects records that have matching values in both tables. It is the most common type of join.",
    syntax: "SELECT columns\nFROM table1\nINNER JOIN table2 ON table1.column = table2.column;",
    useCase: "Use it to combine rows from two or more tables based on a related column between them, like getting customer names and the products they ordered.",
    examples: [
      {
        title: 'Join Customers and Orders',
        steps: [
          {
            explanation: 'Start with the two base tables. Rows that have a matching `CustomerID` in the other table are highlighted.',
            query: '-- Base Tables',
            tables: [
              { ...customersTable, rows: customersTable.rows.map(c => ({...c, highlight: customerIDsInOrders.has(c.CustomerID)})) },
              { ...ordersTable, rows: ordersTable.rows.map(o => ({...o, highlight: customerIDsInCustomers.has(o.CustomerID)})) }
            ],
          },
          {
            explanation: 'Perform an `INNER JOIN` on `CustomerID`. Only rows with matching `CustomerID` in both tables are included.',
            query: 'SELECT C.Name, O.Product, O.Amount\nFROM Customers C\nINNER JOIN Orders O ON C.CustomerID = O.CustomerID;',
            tables: [{
              name: 'Result',
              columns: ['Name', 'Product', 'Amount'],
              rows: [
                { Name: 'Alice', Product: 'Laptop', Amount: 1200, highlight: true },
                { Name: 'Bob', Product: 'Mouse', Amount: 25, highlight: true },
                { Name: 'Alice', Product: 'Keyboard', Amount: 75, highlight: true },
                { Name: 'Charlie', Product: 'Monitor', Amount: 300, highlight: true },
              ],
            }],
          },
        ],
      },
    ]
  },
  'LEFT JOIN': {
    description: "The LEFT JOIN keyword returns all records from the left table (table1), and the matching records from the right table (table2). The result is NULL from the right side if there is no match.",
    syntax: "SELECT columns\nFROM table1\nLEFT JOIN table2 ON table1.column = table2.column;",
    useCase: "Use it when you want to see all records from one table, regardless of whether they have a match in the second table. For example, to list all customers and any orders they may have placed.",
    examples: [
       {
        title: 'Join Customers and Orders',
        steps: [
          {
            explanation: 'Start with the two base tables. All rows from the left table (`Customers`) will be included. Rows with a match are green; rows without a match are red.',
            query: '-- Base Tables',
            tables: [
              { ...customersTable, rows: customersTable.rows.map(c => {
                  const hasMatch = customerIDsInOrders.has(c.CustomerID);
                  return {...c, highlight: hasMatch, unmatched: !hasMatch };
                })
              },
              { ...ordersTable, rows: ordersTable.rows.map(o => ({...o, highlight: customerIDsInCustomers.has(o.CustomerID)})) }
            ],
          },
          {
            explanation: 'A `LEFT JOIN` returns all records from the left table (`Customers`), and the matched records from the right table (`Orders`). Rows in `Customers` with no matching order will have `NULL` for order columns.',
            query: 'SELECT C.Name, O.Product\nFROM Customers C\nLEFT JOIN Orders O ON C.CustomerID = O.CustomerID;',
            tables: [{
              name: 'Result',
              columns: ['Name', 'Product'],
              rows: [
                { Name: 'Alice', Product: 'Laptop', highlight: true },
                { Name: 'Alice', Product: 'Keyboard', highlight: true },
                { Name: 'Bob', Product: 'Mouse', highlight: true },
                { Name: 'Charlie', Product: 'Monitor', highlight: true },
                { Name: 'Diana', Product: null, unmatched: true },
              ],
            }],
          },
        ],
      },
    ]
  },
  'RIGHT JOIN': {
    description: "The RIGHT JOIN keyword returns all records from the right table (table2), and the matching records from the left table (table1). The result is NULL from the left side when there is no match.",
    syntax: "SELECT columns\nFROM table1\nRIGHT JOIN table2 ON table1.column = table2.column;",
    useCase: "This is less common, but useful when you want all records from the second table. For instance, showing all orders, even if the customer who placed it has been deleted.",
    examples: [
       {
        title: 'Join Customers and Orders',
        steps: [
          {
            explanation: 'Start with the two base tables. All rows from the right table (`Orders`) will be included. Rows with a match are green; rows without a match are red.',
            query: '-- Base Tables',
            tables: [
              { ...customersTable, rows: customersTable.rows.map(c => ({...c, highlight: customerIDsInOrders.has(c.CustomerID)})) },
              { ...ordersTable, rows: ordersTable.rows.map(o => {
                  const hasMatch = customerIDsInCustomers.has(o.CustomerID);
                  return {...o, highlight: hasMatch, unmatched: !hasMatch };
                })
              }
            ],
          },
          {
            explanation: 'A `RIGHT JOIN` returns all records from the right table (`Orders`), and the matched records from the left table (`Customers`). The order with `CustomerID` 5 has no matching customer.',
            query: 'SELECT C.Name, O.Product\nFROM Customers C\nRIGHT JOIN Orders O ON C.CustomerID = O.CustomerID;',
            tables: [{
              name: 'Result',
              columns: ['Name', 'Product'],
              rows: [
                { Name: 'Alice', Product: 'Laptop', highlight: true },
                { Name: 'Alice', Product: 'Keyboard', highlight: true },
                { Name: 'Bob', Product: 'Mouse', highlight: true },
                { Name: 'Charlie', Product: 'Monitor', highlight: true },
                { Name: null, Product: 'Webcam', unmatched: true },
              ],
            }],
          },
        ],
      },
    ]
  },
  'FULL OUTER JOIN': {
    description: "The FULL OUTER JOIN keyword returns all records when there is a match in either left (table1) or right (table2) table records. It is a combination of LEFT JOIN and RIGHT JOIN.",
    syntax: "SELECT columns\nFROM table1\nFULL OUTER JOIN table2 ON table1.column = table2.column;",
    useCase: "Use it when you need a complete dataset from both tables, showing all matched and unmatched rows. For example, to see all customers and all orders, linking them where possible.",
    examples: [
      {
        title: 'Join Customers and Orders',
        steps: [
          {
            explanation: 'Start with the two base tables. All rows from both tables are included. Matching rows are green; non-matching rows are red.',
            query: '-- Base Tables',
            tables: [
               { ...customersTable, rows: customersTable.rows.map(c => {
                  const hasMatch = customerIDsInOrders.has(c.CustomerID);
                  return {...c, highlight: hasMatch, unmatched: !hasMatch };
                })
              },
              { ...ordersTable, rows: ordersTable.rows.map(o => {
                  const hasMatch = customerIDsInCustomers.has(o.CustomerID);
                  return {...o, highlight: hasMatch, unmatched: !hasMatch };
                })
              }
            ],
          },
          {
            explanation: 'A `FULL OUTER JOIN` returns all records when there is a match in either the left (`Customers`) or right (`Orders`) table. Unmatched rows from either table will have `NULL` values for columns from the other table.',
            query: 'SELECT C.Name, O.Product\nFROM Customers C\nFULL OUTER JOIN Orders O ON C.CustomerID = O.CustomerID;',
            tables: [{
              name: 'Result',
              columns: ['Name', 'Product'],
              rows: [
                { Name: 'Alice', Product: 'Laptop', highlight: true },
                { Name: 'Alice', Product: 'Keyboard', highlight: true },
                { Name: 'Bob', Product: 'Mouse', highlight: true },
                { Name: 'Charlie', Product: 'Monitor', highlight: true },
                { Name: 'Diana', Product: null, unmatched: true },
                { Name: null, Product: 'Webcam', unmatched: true },
              ],
            }],
          },
        ],
      },
    ]
  },
  'GROUP BY': {
    description: "The GROUP BY statement groups rows that have the same values into summary rows, like 'find the number of customers in each country'. The GROUP BY statement is often used with aggregate functions (COUNT(), MAX(), MIN(), SUM(), AVG()) to group the result-set by one or more columns.",
    syntax: "SELECT column_name(s)\nFROM table_name\nWHERE condition\nGROUP BY column_name(s);",
    useCase: "Use it to aggregate data. For example, calculating the total sales per country, or counting the number of orders for each customer.",
    examples: [
      {
        title: 'Count customers per country',
        steps: [
           {
            explanation: 'Start with the base table `Customers`. We will group by the `Country` column.',
            query: '-- Base Table',
            tables: [customersTable],
          },
          {
            explanation: 'First, the database groups the rows by `Country`.',
            query: '-- Intermediate: Grouping',
            tables: [
              {
                name: 'Group: USA',
                columns: customersTable.columns,
                rows: customersTable.rows.filter(c => c.Country === 'USA').map(r => ({...r, highlight: true})),
              },
              {
                name: 'Group: Canada',
                columns: customersTable.columns,
                rows: customersTable.rows.filter(c => c.Country === 'Canada').map(r => ({...r, highlight: true})),
              },
               {
                name: 'Group: UK',
                columns: customersTable.columns,
                rows: customersTable.rows.filter(c => c.Country === 'UK').map(r => ({...r, highlight: true})),
              }
            ],
          },
          {
            explanation: 'Then, the `COUNT(CustomerID)` aggregate function counts the number of customers in each group.',
            query: 'SELECT Country, COUNT(CustomerID) AS CustomerCount\nFROM Customers\nGROUP BY Country;',
            tables: [{
              name: 'Result',
              columns: ['Country', 'CustomerCount'],
              rows: [
                { Country: 'USA', CustomerCount: 2, highlight: true },
                { Country: 'Canada', CustomerCount: 1, highlight: true },
                { Country: 'UK', CustomerCount: 1, highlight: true },
              ],
            }],
          },
        ],
      },
       {
        title: 'Calculate total order amount per customer',
        steps: [
           {
            explanation: 'Start with the base table `Orders`. We will group by `CustomerID`.',
            query: '-- Base Table',
            tables: [ordersTable],
          },
          {
            explanation: 'First, the rows are grouped by `CustomerID`.',
            query: '-- Intermediate: Grouping',
            tables: [
              {
                name: 'Group: CustomerID 1',
                columns: ordersTable.columns,
                rows: ordersTable.rows.filter(o => o.CustomerID === 1).map(r => ({...r, highlight: true})),
              },
              {
                name: 'Group: CustomerID 2',
                columns: ordersTable.columns,
                rows: ordersTable.rows.filter(o => o.CustomerID === 2).map(r => ({...r, highlight: true})),
              },
               {
                name: 'Group: CustomerID 3',
                columns: ordersTable.columns,
                rows: ordersTable.rows.filter(o => o.CustomerID === 3).map(r => ({...r, highlight: true})),
              },
              {
                name: 'Group: CustomerID 5',
                columns: ordersTable.columns,
                rows: ordersTable.rows.filter(o => o.CustomerID === 5).map(r => ({...r, highlight: true})),
              }
            ],
          },
          {
            explanation: 'Then, `SUM(Amount)` calculates the total amount for each customer group.',
            query: 'SELECT CustomerID, SUM(Amount) AS TotalAmount\nFROM Orders\nGROUP BY CustomerID;',
            tables: [{
              name: 'Result',
              columns: ['CustomerID', 'TotalAmount'],
              rows: [
                { CustomerID: 1, TotalAmount: 1275, highlight: true },
                { CustomerID: 2, TotalAmount: 25, highlight: true },
                { CustomerID: 3, TotalAmount: 300, highlight: true },
                { CustomerID: 5, TotalAmount: 50, highlight: true },
              ],
            }],
          },
        ],
      },
    ]
  },
  'ORDER BY': {
    description: "The ORDER BY keyword is used to sort the result-set in ascending or descending order.",
    syntax: "SELECT columns\nFROM table_name\nORDER BY column1 [ASC|DESC], column2 [ASC|DESC], ...;",
    useCase: "Use it whenever the sequence of the output rows matters, such as sorting customers by name, or products by price.",
    examples: [
      {
        title: 'Sort by one column (ASC)',
        steps: [
          {
            explanation: 'The `ORDER BY Name` clause sorts the result alphabetically by the `Name` column. `ASC` (ascending) is the default.',
            query: 'SELECT * FROM Customers ORDER BY Name;',
            tables: [
              {
                ...customersTable,
                name: 'Result',
                rows: [...customersTable.rows].sort((a, b) => a.Name.localeCompare(b.Name)),
              },
            ],
          },
        ],
      },
      {
        title: 'Sort by one column (DESC)',
        steps: [
          {
            explanation: 'Using `DESC` (descending) sorts the result in reverse alphabetical order.',
            query: 'SELECT * FROM Customers ORDER BY Name DESC;',
            tables: [
              {
                ...customersTable,
                name: 'Result',
                rows: [...customersTable.rows].sort((a, b) => b.Name.localeCompare(a.Name)),
              },
            ],
          },
        ],
      },
      {
        title: 'Sort by multiple columns',
        steps: [
          {
            explanation: 'This sorts first by `Department` alphabetically, and then for rows with the same department, it sorts by `Salary` in descending order.',
            query: 'SELECT Name, Department, Salary FROM Employees ORDER BY Department ASC, Salary DESC;',
            tables: [
              {
                name: 'Result',
                columns: ['Name', 'Department', 'Salary'],
                rows: [...employeesTable.rows].sort((a, b) => {
                  if (a.Department < b.Department) return -1;
                  if (a.Department > b.Department) return 1;
                  return b.Salary - a.Salary; // DESC
                }),
              },
            ],
          },
        ],
      },
    ]
  },
   'UNION': {
    description: "The UNION operator is used to combine the result-set of two or more SELECT statements. Each SELECT statement within UNION must have the same number of columns. The columns must also have similar data types. Also, the columns in each SELECT statement must be in the same order.",
    syntax: "SELECT column_name(s) FROM table1\nUNION\nSELECT column_name(s) FROM table2;",
    useCase: "Use it to merge results from multiple queries into a single result set. For example, getting a combined list of all customers and employees.",
    examples: [
      {
        title: 'Combine names from Customers and Employees',
        steps: [
          {
            explanation: 'First, two separate `SELECT` statements are executed.',
            query: '-- Component Queries',
            tables: [
              {
                name: 'Customers Names',
                columns: ['Name'],
                rows: customersTable.rows.map(c => ({ Name: c.Name, highlight: true })),
              },
              {
                name: 'Employees Names',
                columns: ['Name'],
                rows: employeesTable.rows.map(e => ({ Name: e.Name, highlight: true })),
              },
            ],
          },
          {
            explanation: 'The `UNION` operator combines the results of both queries into a single column and removes duplicate values. Note that `UNION ALL` would keep duplicates.',
            query: "SELECT Name FROM Customers\nUNION\nSELECT Name FROM Employees;",
            tables: [{
              name: 'Result',
              columns: ['Name'],
              rows: Array.from(new Set([...customersTable.rows.map(c => c.Name), ...employeesTable.rows.map(e => e.Name)])).sort().map(name => ({Name: name})),
            }],
          },
        ],
      },
    ]
  },
  'Subquery': {
    description: "A subquery, or inner query, is a query nested inside another SQL query. It is used to return data that will be used in the main query as a condition to further restrict the data to be retrieved.",
    syntax: "SELECT column_name(s)\nFROM table_name\nWHERE column_name IN (SELECT column_name FROM table_name WHERE ...);",
    useCase: "Use subqueries to perform multi-step queries where the result of one query is needed to filter the data for another, such as finding all customers who have placed an order.",
    examples: [
      {
        title: 'Find customers who placed an order',
        steps: [
          {
            explanation: 'First, the inner query (subquery) is executed to find all unique `CustomerID`s from the `Orders` table.',
            query: "SELECT DISTINCT CustomerID FROM Orders;",
            tables: [ordersTable],
          },
          {
            explanation: 'The subquery returns a list of `CustomerID`s.',
            query: '-- Subquery Result',
            tables: [{
              name: 'Subquery Result',
              columns: ['CustomerID'],
              rows: Array.from(customerIDsInOrders).map(id => ({ CustomerID: id })),
            }],
          },
          {
            explanation: 'Then, the outer query runs. It selects customers from the `Customers` table whose `CustomerID` is in the list returned by the subquery.',
            query: `SELECT *\nFROM Customers\nWHERE CustomerID IN (${Array.from(customerIDsInOrders).join(', ')});`,
            tables: [customersTable],
          },
          {
            explanation: 'The final result contains only the customers who have placed an order. Note CustomerID 4 is excluded and CustomerID 5 from orders has no match in Customers.',
            query: "SELECT * FROM Customers\nWHERE CustomerID IN (SELECT DISTINCT CustomerID FROM Orders);",
            tables: [{
              name: 'Result',
              columns: customersTable.columns,
              rows: customersTable.rows.filter(c => customerIDsInOrders.has(c.CustomerID)).map(r => ({...r, highlight: true})),
            }],
          },
        ],
      },
    ]
  },
  'CTE': {
    description: "A Common Table Expression (CTE) allows you to define a temporary, named result set that you can reference within a SELECT, INSERT, UPDATE, or DELETE statement. It helps to simplify complex queries.",
    syntax: "WITH cte_name (column_list) AS (\n  SELECT ...\n)\nSELECT ... FROM cte_name;",
    useCase: "Use CTEs to break down complex logic into readable, logical steps, such as filtering a set of data first and then joining it to another table.",
    examples: [
      {
        title: 'Find orders from USA customers',
        steps: [
          {
            explanation: 'First, define a CTE named `USA_Customers` to select only customers from the USA.',
            query: "WITH USA_Customers AS (\n  SELECT CustomerID, Name FROM Customers WHERE Country = 'USA'\n)...",
            tables: [customersTable],
          },
          {
            explanation: 'The CTE creates a temporary, in-memory table with just the USA customers.',
            query: '-- CTE Result: USA_Customers',
            tables: [{
              name: 'USA_Customers (CTE)',
              columns: ['CustomerID', 'Name'],
              rows: customersTable.rows.filter(c => c.Country === 'USA'),
            }],
          },
          {
            explanation: 'Finally, join this CTE with the `Orders` table to get the final result.',
            query: "... SELECT u.Name, o.Product\nFROM USA_Customers u\nJOIN Orders o ON u.CustomerID = o.CustomerID;",
            tables: [{
              name: 'Result',
              columns: ['Name', 'Product'],
              rows: [
                { Name: 'Alice', Product: 'Laptop', highlight: true },
                { Name: 'Alice', Product: 'Keyboard', highlight: true },
                { Name: 'Charlie', Product: 'Monitor', highlight: true },
              ]
            }],
          },
        ],
      },
    ]
  },
  'Window Functions': {
    description: "A window function performs a calculation across a set of table rows that are somehow related to the current row. Unlike aggregate functions, window functions do not cause rows to become grouped into a single output row.",
    syntax: "SELECT ...,\n  FUNCTION_NAME() OVER (PARTITION BY ... ORDER BY ...) AS alias\nFROM table_name;",
    useCase: "Use them for tasks like ranking results within categories (e.g., top employees by sales per region) or calculating running totals.",
    examples: [
      {
        title: 'RANK() by salary per department',
        steps: [
          {
            explanation: 'Start with the `Employees` table. We want to rank employees by salary within each department.',
            query: '-- Base Table',
            tables: [employeesTable]
          },
          {
            explanation: 'The `PARTITION BY Department` clause divides the rows into partitions (groups). The function is applied independently to each partition.',
            query: '-- Intermediate: Partitioning',
            tables: [
              { name: 'Partition: Engineering', columns: employeesTable.columns, rows: employeesTable.rows.filter(e => e.Department === 'Engineering')},
              { name: 'Partition: HR', columns: employeesTable.columns, rows: employeesTable.rows.filter(e => e.Department === 'HR')},
              { name: 'Partition: Sales', columns: employeesTable.columns, rows: employeesTable.rows.filter(e => e.Department === 'Sales')},
            ]
          },
          {
            explanation: 'Within each partition, `ORDER BY Salary DESC` sorts the rows. Then, `RANK()` assigns a rank. Note that ties (e.g., Frank and Grace) receive the same rank, and a gap appears in the sequence afterward.',
            query: "SELECT Name, Department, Salary,\n  RANK() OVER (PARTITION BY Department ORDER BY Salary DESC) AS DeptRank\nFROM Employees;",
            tables: [{
              name: 'Result',
              columns: ['Name', 'Department', 'Salary', 'DeptRank'],
              rows: [
                { Name: 'Ivan', Department: 'Engineering', Salary: 110000, DeptRank: 1 },
                { Name: 'Heidi', Department: 'Engineering', Salary: 95000, DeptRank: 2 },
                { Name: 'Judy', Department: 'HR', Salary: 60000, DeptRank: 1 },
                { Name: 'Mallory', Department: 'Sales', Salary: 80000, DeptRank: 1 },
                { Name: 'Frank', Department: 'Sales', Salary: 75000, DeptRank: 2 },
                { Name: 'Grace', Department: 'Sales', Salary: 75000, DeptRank: 2 },
              ].sort((a, b) => a.Department.localeCompare(b.Department) || b.Salary - a.Salary)
            }]
          }
        ]
      },
      {
        title: 'ROW_NUMBER() by salary per department',
        steps: [
           {
            explanation: 'Start with the `Employees` table.',
            query: '-- Base Table',
            tables: [employeesTable]
          },
           {
            explanation: 'Like `RANK()`, this function operates over partitions. However, `ROW_NUMBER()` assigns a unique, sequential number to each row within the partition, even if there are ties.',
            query: "SELECT Name, Department, Salary,\n  ROW_NUMBER() OVER (PARTITION BY Department ORDER BY Salary DESC) AS RowNum\nFROM Employees;",
            tables: [{
              name: 'Result',
              columns: ['Name', 'Department', 'Salary', 'RowNum'],
              rows: [
                { Name: 'Ivan', Department: 'Engineering', Salary: 110000, RowNum: 1 },
                { Name: 'Heidi', Department: 'Engineering', Salary: 95000, RowNum: 2 },
                { Name: 'Judy', Department: 'HR', Salary: 60000, RowNum: 1 },
                { Name: 'Mallory', Department: 'Sales', Salary: 80000, RowNum: 1 },
                { Name: 'Grace', Department: 'Sales', Salary: 75000, RowNum: 2 },
                { Name: 'Frank', Department: 'Sales', Salary: 75000, RowNum: 3 },
              ].sort((a, b) => a.Department.localeCompare(b.Department) || b.Salary - a.Salary)
            }]
          }
        ]
      }
    ]
  },
  'DML (Data Manipulation)': {
    description: "Data Manipulation Language (DML) is used to manage data within schema objects. The main DML statements are INSERT, UPDATE, and DELETE.",
    syntax: "INSERT INTO table_name ...\nUPDATE table_name SET ...\nDELETE FROM table_name WHERE ...",
    useCase: "Use DML to add new data, modify existing data, or remove data from tables.",
    examples: [
      {
        title: 'INSERT a new row',
        steps: [
          {
            explanation: 'This is the `Customers` table before the operation.',
            query: '-- Before INSERT',
            tables: [customersTable]
          },
          {
            explanation: 'The `INSERT INTO` statement adds a new row to the table with the specified values.',
            query: "INSERT INTO Customers (CustomerID, Name, Country) VALUES (5, 'Eve', 'UK');",
            tables: [{
              ...customersTable,
              name: 'Result',
              rows: [
                ...customersTable.rows,
                { CustomerID: 5, Name: 'Eve', Country: 'UK', inserted: true }
              ]
            }]
          }
        ]
      },
      {
        title: 'UPDATE an existing row',
        steps: [
          {
            explanation: 'This is the `Customers` table before the operation.',
            query: '-- Before UPDATE',
            tables: [customersTable]
          },
          {
            explanation: "The `UPDATE` statement modifies existing records. Here, we change the `Country` for `CustomerID` 4 to 'Germany'.",
            query: "UPDATE Customers\nSET Country = 'Germany'\nWHERE CustomerID = 4;",
            tables: [{
              ...customersTable,
              name: 'Result',
              rows: customersTable.rows.map(r => r.CustomerID === 4 ? { ...r, Country: 'Germany', updated: true, updatedCells: ['Country'] } : r)
            }]
          }
        ]
      },
      {
        title: 'DELETE a row',
        steps: [
          {
            explanation: 'This is the `Customers` table before the operation. The row to be deleted is highlighted.',
            query: '-- Before DELETE',
            tables: [{
              ...customersTable,
              rows: customersTable.rows.map(r => r.CustomerID === 2 ? {...r, unmatched: true} : r)
            }]
          },
          {
            explanation: 'The `DELETE` statement removes existing records. Here, we remove the customer with `CustomerID` 2.',
            query: "DELETE FROM Customers WHERE CustomerID = 2;",
            tables: [{
              ...customersTable,
              name: 'Result',
              rows: customersTable.rows.filter(r => r.CustomerID !== 2)
            }]
          }
        ]
      }
    ]
  },
  'DDL (Data Definition)': {
    description: "Data Definition Language (DDL) is used to create and modify the structure of database objects like tables. The main DDL statements are CREATE, ALTER, and DROP.",
    syntax: "CREATE TABLE table_name (...)\nALTER TABLE table_name ...\nDROP TABLE table_name;",
    useCase: "Use DDL when setting up or changing the database schema, such as creating a new table or adding a column to an existing one.",
    examples: [
      {
        title: 'CREATE a new table',
        steps: [
           {
            explanation: 'The `CREATE TABLE` statement defines a new table, specifying its name and the names and data types of each column.',
            query: "CREATE TABLE Products (\n  ProductID INT,\n  Name VARCHAR(255),\n  Price DECIMAL(10, 2)\n);",
            tables: [{
              name: 'Products (New)',
              columns: ['ProductID', 'Name', 'Price'],
              rows: []
            }]
          }
        ]
      },
      {
        title: 'ALTER an existing table',
        steps: [
          {
            explanation: 'This is the `Customers` table before the operation.',
            query: '-- Before ALTER',
            tables: [customersTable]
          },
          {
            explanation: 'The `ALTER TABLE` statement modifies a table definition. Here, we add a new `Email` column.',
            query: "ALTER TABLE Customers\nADD Email VARCHAR(255);",
            tables: [{
              ...customersTable,
              name: 'Result',
              columns: [...customersTable.columns, 'Email'],
              rows: customersTable.rows.map(r => ({...r, Email: null}))
            }]
          }
        ]
      },
    ]
  },
};


// --- REACT COMPONENTS ---

const Table = ({ data }) => {
  if (!data || !data.rows || data.rows.length === 0) {
    return <div className="step-message">This step resulted in an empty set.</div>;
  }
  
  const headers = data.columns || Object.keys(data.rows[0]);

  return (
    <div className="table-wrapper">
      {data.name && <h3>{data.name}</h3>}
      <table>
        <thead>
          <tr>
            {headers.map((header) => <th key={header}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => {
            const rowClass = row.highlight ? 'highlight' : row.unmatched ? 'unmatched' : row.inserted ? 'inserted' : row.updated ? 'updated' : '';
            return (
              <tr key={`row-${rowIndex}`} className={rowClass}>
                {headers.map((header, colIndex) => {
                  const value = row[header];
                  const isNull = value === null || value === undefined;
                  const cellClass = row.updatedCells && row.updatedCells.includes(header) ? 'cell-updated' : '';
                  return (
                    <td key={`cell-${rowIndex}-${colIndex}`} className={`${isNull ? 'null-value' : ''} ${cellClass}`}>
                      {isNull ? 'NULL' : String(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const Step = ({ step, index, isVisible }) => {
  const stepRef = useRef(null);

  return (
    <div ref={stepRef} className={`step ${isVisible ? 'visible' : ''}`} aria-live="polite">
      <div className="step-explanation">{index + 1}. {step.explanation}</div>
      <div className="step-query">
        <code>{step.query}</code>
      </div>
      <div className="tables-container">
        {step.tables && step.tables.length > 0
          ? step.tables.map((tableData, i) => <Table key={`table-${i}`} data={tableData} />)
          : <div className="step-message">No table to display for this step.</div>
        }
      </div>
    </div>
  );
};

const TopicDescription = ({ topic }) => (
  <div className="topic-description">
    <h3>About {topic.title}</h3>
    <p>{topic.description}</p>
    <h4>Syntax</h4>
    <pre><code>{topic.syntax}</code></pre>
    <h4>Common Use Case</h4>
    <p>{topic.useCase}</p>
  </div>
);

const Visualization = () => {
  const [selectedTopicKey, setSelectedTopicKey] = useState(Object.keys(sqlTopics)[0]);
  const [selectedExampleIndex, setSelectedExampleIndex] = useState(0);

  const selectedTopic = sqlTopics[selectedTopicKey];
  const selectedExample = selectedTopic.examples[selectedExampleIndex];

  const handleTopicChange = (e) => {
    setSelectedTopicKey(e.target.value);
    setSelectedExampleIndex(0);
  };

  const handleExampleChange = (e) => {
    setSelectedExampleIndex(Number(e.target.value));
  };
  
  const [visibleSteps, setVisibleSteps] = useState([]);
  const observerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Fix: Cast entry.target to HTMLElement to access dataset property.
            setVisibleSteps(prev => [...prev, Number((entry.target as HTMLElement).dataset.stepIndex)]);
          }
        });
      },
      { threshold: 0.3 }
    );
    observerRef.current = observer;

    return () => observer.disconnect();
  }, []);
  
  useEffect(() => {
    setVisibleSteps([]);
    const steps = document.querySelectorAll('.step');
    steps.forEach((step, index) => {
        // Fix: Cast step to HTMLElement to access dataset property and convert index to string.
        (step as HTMLElement).dataset.stepIndex = String(index);
        observerRef.current.observe(step);
    });
    
    return () => {
        if(observerRef.current) {
            steps.forEach(step => observerRef.current.unobserve(step));
        }
    }

  }, [selectedExample]);

  return (
    <div>
      <div className="controls">
        <div className="control-group">
          <label htmlFor="topic-select">SQL Topic</label>
          <select id="topic-select" value={selectedTopicKey} onChange={handleTopicChange}>
            {Object.keys(sqlTopics).map(key => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label htmlFor="example-select">Example</label>
          <select id="example-select" value={selectedExampleIndex} onChange={handleExampleChange}>
            {selectedTopic.examples.map((ex, index) => (
              <option key={`ex-${index}`} value={index}>{ex.title}</option>
            ))}
          </select>
        </div>
      </div>

      <TopicDescription topic={{ ...selectedTopic, title: selectedTopicKey }} />

      <div className="visualization">
        {selectedExample.steps.map((step, index) => (
          <Step key={`step-${selectedTopicKey}-${selectedExampleIndex}-${index}`} step={step} index={index} isVisible={visibleSteps.includes(index)}/>
        ))}
      </div>
    </div>
  );
};


// This function formats the text response from the API.
const formatAiResponse = (text: string) => {
    let html = text;
    // Bold (e.g., **text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic (e.g., *text*)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Unordered lists
    html = html.replace(/^\s*[-*] (.*)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s?<ul>/g, ''); // Collapse consecutive lists
    // Newlines for paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;
    return html;
};

// Main React component
const QueryExplainer = () => {
    const [query, setQuery] = useState('SELECT\n    c.Name AS CustomerName,\n    COUNT(o.OrderID) AS NumberOfOrders,\n    SUM(o.Amount) AS TotalSpent\nFROM\n    Customers c\nJOIN\n    Orders o ON c.CustomerID = o.CustomerID\nWHERE\n    c.Country = \'USA\'\nGROUP BY\n    c.Name\nORDER BY\n    TotalSpent DESC\nLIMIT 1;');
    const [explanation, setExplanation] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const callGemini = async () => {
        if (!query.trim()) {
            setError('Please enter a SQL query.');
            return;
        }

        setIsLoading(true);
        setError('');
        setExplanation('');
        
        try {
            // **CORRECTED:** Call the serverless function at the path /api/explain
            const response = await fetch('/api/explain', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });

            const data = await response.json();

            // Handle errors returned from the serverless function
            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong on the server.');
            }
            
            setExplanation(formatAiResponse(data.explanation));

        } catch (err) {
            console.error(err);
            setError(`An error occurred: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="query-explainer p-8 max-w-2xl mx-auto font-sans bg-gray-50 min-h-screen">
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .spinner {
                    border: 4px solid rgba(0, 0, 0, 0.1);
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border-left-color: #007bff;
                    animation: spin 1s linear infinite;
                }
            `}</style>
            <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Explain Your SQL with AI</h1>
                <p className="text-gray-600 mb-6">Enter any SQL query below and our AI assistant will break it down into a step-by-step explanation.</p>
                <div className="explainer-input-area mb-6">
                    <textarea 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Enter your SQL query here..."
                        aria-label="SQL Query Input"
                        rows={10}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 resize-none font-mono text-sm"
                    />
                    <button onClick={callGemini} disabled={isLoading}
                        className="w-full mt-4 py-3 px-6 bg-blue-600 text-white rounded-lg font-semibold shadow-md hover:bg-blue-700 transition-colors duration-200 disabled:bg-blue-300 disabled:cursor-not-allowed">
                        {isLoading ? 'Thinking...' : '✨ Explain with AI'}
                    </button>
                </div>
                {error && <p className="error-message text-red-500 text-center">{error}</p>}
                
                {isLoading && (
                    <div className="loading-container flex flex-col items-center justify-center mt-8">
                        <div className="spinner"></div>
                        <p className="mt-4 text-gray-500">Generating explanation...</p>
                    </div>
                )}

                {explanation && (
                    <div className="ai-explanation-content mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">AI Explanation</h3>
                        <div dangerouslySetInnerHTML={{ __html: explanation }} className="text-gray-700 leading-relaxed space-y-4"></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const App = () => {
  const [activeTab, setActiveTab] = useState('visualizer');
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <>
      <header>
        <h1>Interactive SQL Visualizer</h1>
        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
           {theme === 'light' ? (
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 1.755 0 3.408-.46 4.802-1.248Z" />
             </svg>
           ) : (
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-.386 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591M12 12a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
             </svg>
           )}
        </button>
      </header>
      <main>
        <div className="tabs">
          <button 
            className={`tab-button ${activeTab === 'visualizer' ? 'active' : ''}`}
            onClick={() => setActiveTab('visualizer')}
            aria-selected={activeTab === 'visualizer'}
            role="tab"
          >
            Visualize Queries
          </button>
          <button 
            className={`tab-button ${activeTab === 'explainer' ? 'active' : ''}`}
            onClick={() => setActiveTab('explainer')}
            aria-selected={activeTab === 'explainer'}
            role="tab"
          >
            Explain with AI
          </button>
        </div>
        <div className="tab-content">
          {activeTab === 'visualizer' && <Visualization />}
          {activeTab === 'explainer' && <QueryExplainer />}
        </div>
      </main>
      <footer>
        <p>A learning tool to make complex SQL concepts intuitive and clear.</p>
      </footer>
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
